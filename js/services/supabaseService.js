/**
 * supabaseService.js
 * The single file responsible for ALL communication with the database.
 * Every other file that used to talk to localStorage now goes through
 * storageService.js, which delegates every method here — this is the
 * only file that imports the Supabase client or knows a table/column
 * name exists.
 *
 * Design goal: every method here returns data shaped EXACTLY like the
 * JS objects the rest of the app already works with (camelCase, same
 * field names attendanceEngine.js/requestService.js/etc. already use).
 * The camelCase <-> snake_case translation happens ONLY in this file —
 * no other file needed to change its data shapes, only add `await`.
 *
 * Error handling: every method throws a plain Error on failure instead
 * of swallowing it. This is intentional — every engine that calls
 * StorageService already wraps its logic in try/catch and routes
 * failures through AuditService.logError() + a GENERIC_ERROR
 * notification (built during the hardening phase). Throwing here means
 * that existing error handling catches Supabase failures automatically,
 * with no new error-handling code needed anywhere else.
 */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config/supabaseConfig.js";
import { HOME_STORE_ID } from "../config/stores.js";

// If you see "Cannot read properties of null (reading 'AuthClient')" or a
// similar error in the browser console, jsDelivr's +esm build has a known
// issue with this package as of late 2025 — switch the import above to:
//   import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// and reload. See SUPABASE_SETUP.md -> "Troubleshooting" for details.

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Throws a clear Error if a Supabase call failed; otherwise returns `data`. */
function unwrap(result, context) {
  if (result.error) {
    throw new Error(`Supabase error in ${context}: ${result.error.message}`);
  }
  return result.data;
}

// ================================================================
// AUTH BRIDGE
// See onsite-supabase/07_auth_bridge_policy.sql for why this exists.
// Every RLS policy keys off auth.uid(), but the app's login has
// always been "type an ID, any password" with no real Supabase Auth
// session. This creates an anonymous session (if one doesn't already
// exist in this browser) and links it to the given login code, so RLS
// has a real auth.uid() to check against without changing the visible
// login UI at all.
// ================================================================

/**
 * @param {string} loginCode - the ID the person typed at the login screen (e.g. "1001", "9000")
 * @returns {Promise<void>}
 */
export async function linkSupabaseSession(loginCode) {
  // Always start from a clean session before linking a new login code.
  // Without this, switching users in the SAME browser tab (e.g. testing
  // 1001 then 9000) would reuse the still-active anonymous session from
  // the first login — pointing BOTH login codes at the same auth.uid()
  // and breaking every RLS policy's "which role is this session" lookup
  // for both of them. Signing out first guarantees every login gets a
  // genuinely fresh, unique identity.
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session) {
    await supabase.auth.signOut();
  }

  const signInResult = await supabase.auth.signInAnonymously();
  if (signInResult.error) {
    throw new Error(`Supabase error establishing a session: ${signInResult.error.message}`);
  }

  const { data: userData } = await supabase.auth.getUser();
  const authUserId = userData.user?.id;
  if (!authUserId) {
    throw new Error("Supabase error: no auth user available after sign-in");
  }

  // No .select() here on purpose — asking for the updated row back would
  // require it to ALSO satisfy a SELECT policy, which creates a chicken-
  // and-egg problem the very first time a login code is linked: before
  // this update, no SELECT policy recognizes this session yet (auth_user_id
  // isn't set), so the "returned row" would be invisible even though the
  // update itself succeeded. We only need to know the update didn't error —
  // not read the row back — so this sidesteps that entirely.
  const result = await supabase.from("staff_accounts").update({ auth_user_id: authUserId }).eq("login_code", loginCode);
  if (result.error) {
    throw new Error(`Supabase error in linkSupabaseSession: ${result.error.message}`);
  }
}

// ================================================================
// FIELD MAPPING — one pair of functions per table. JS objects on the
// left of every mapping below use the EXACT field names already used
// throughout attendanceEngine.js / requestService.js / employeeService.js
// / closureService.js / auditService.js — nothing was renamed.
// ================================================================

function recordRowToJs(row) {
  if (!row) return null;
  return {
    employeeId: row.employee_id,
    name: row.employee_name,
    store: row.store_id,
    date: row.record_date,
    shift: row.shift_key,
    checkInTime: row.check_in_time,
    checkOutTime: row.check_out_time,
    totalHours: row.total_hours === null ? null : Number(row.total_hours),
    overtimeHours: Number(row.overtime_hours ?? 0),
    overtimeConfirmed: row.overtime_confirmed,
    overtimeConfirmedBy: row.overtime_confirmed_by,
    overtimeConfirmedAt: row.overtime_confirmed_at,
    early: row.is_early_arrival,
    earlyLeave: row.is_early_leave,
    earlyLeaveAuthorized: row.early_leave_authorized,
    status: row.status
  };
}

/** Only includes fields present on `record` — lets this double as a partial-update mapper for patch objects. */
function recordJsToRow(record) {
  const row = {};
  if ("employeeId" in record) row.employee_id = record.employeeId;
  if ("name" in record) row.employee_name = record.name;
  if ("store" in record) row.store_id = record.store;
  if ("date" in record) row.record_date = record.date;
  if ("shift" in record) row.shift_key = record.shift;
  if ("checkInTime" in record) row.check_in_time = record.checkInTime;
  if ("checkOutTime" in record) row.check_out_time = record.checkOutTime;
  if ("totalHours" in record) row.total_hours = record.totalHours;
  if ("overtimeHours" in record) row.overtime_hours = record.overtimeHours;
  if ("overtimeConfirmed" in record) row.overtime_confirmed = record.overtimeConfirmed;
  if ("overtimeConfirmedBy" in record) row.overtime_confirmed_by = record.overtimeConfirmedBy;
  if ("overtimeConfirmedAt" in record) row.overtime_confirmed_at = record.overtimeConfirmedAt;
  if ("early" in record) row.is_early_arrival = record.early;
  if ("earlyLeave" in record) row.is_early_leave = record.earlyLeave;
  if ("earlyLeaveAuthorized" in record) row.early_leave_authorized = record.earlyLeaveAuthorized;
  if ("status" in record) row.status = record.status;
  return row;
}

function requestRowToJs(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.request_type,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    targetDate: row.target_date,
    reason: row.reason,
    payload: row.payload || {},
    status: row.status,
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    reviewNote: row.review_note
  };
}

function requestJsToRow(request) {
  const row = {};
  if ("type" in request) row.request_type = request.type;
  if ("employeeId" in request) row.employee_id = request.employeeId;
  if ("employeeName" in request) row.employee_name = request.employeeName;
  if ("targetDate" in request) row.target_date = request.targetDate;
  if ("reason" in request) row.reason = request.reason;
  if ("payload" in request) row.payload = request.payload;
  if ("status" in request) row.status = request.status;
  if ("requestedAt" in request) row.requested_at = request.requestedAt;
  if ("reviewedAt" in request) row.reviewed_at = request.reviewedAt;
  if ("reviewedBy" in request) row.reviewed_by = request.reviewedBy;
  if ("reviewNote" in request) row.review_note = request.reviewNote;
  // Deliberately no `id` mapping on write — Postgres assigns the UUID; see addRequest()/updateRequest() below.
  return row;
}

function employeeRowToJs(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    store: row.home_store_id,
    title: row.title,
    startDate: row.start_date,
    endDate: row.end_date,
    endReason: row.end_reason,
    transferredTo: row.transferred_to
  };
}

function employeeJsToRow(employee) {
  const row = {};
  if ("id" in employee) row.id = employee.id;
  if ("name" in employee) row.name = employee.name;
  if ("store" in employee) row.home_store_id = employee.store;
  if ("title" in employee) row.title = employee.title;
  if ("startDate" in employee) row.start_date = employee.startDate;
  if ("endDate" in employee) row.end_date = employee.endDate;
  if ("endReason" in employee) row.end_reason = employee.endReason;
  if ("transferredTo" in employee) row.transferred_to = employee.transferredTo;
  return row;
}

function closureRowToJs(row) {
  if (!row) return null;
  return { date: row.closure_date, reason: row.reason, addedBy: row.added_by, addedAt: row.added_at };
}

function closureJsToRow(closure) {
  const row = {};
  if ("date" in closure) row.closure_date = closure.date;
  if ("reason" in closure) row.reason = closure.reason;
  if ("addedBy" in closure) row.added_by = closure.addedBy;
  if ("addedAt" in closure) row.added_at = closure.addedAt;
  return row;
}

// Audit events are the one shape that isn't a 1:1 field rename — the JS
// event object mixes together "who is this about" (employeeId) and "who
// did it" (actingAdminId / reviewedBy) depending on event type, while the
// DB has two FIXED columns for that (employee_id, acting_login_code) plus
// a JSONB `details` bucket for everything else. See auditService.js for
// the exact shape each log*() method produces.
const AUDIT_ACTOR_FIELD_BY_EVENT = {
  LOGIN: "employeeId", // for login/logout, "employeeId" is really the login_code of whoever's signing in
  LOGOUT: "employeeId",
  REQUEST_APPROVED: "reviewedBy",
  REQUEST_REJECTED: "reviewedBy",
  EMPLOYEE_ADDED: "actingAdminId",
  EMPLOYEE_REMOVED: "actingAdminId",
  EMPLOYEE_STATUS_CHANGED: "actingAdminId",
  OVERTIME_CONFIRMED: "actingAdminId",
  CLOSURE_ADDED: "actingAdminId",
  CLOSURE_REMOVED: "actingAdminId"
};
// Event types where "employeeId" in the JS event genuinely names a roster
// employee (safe for the FK'd employee_id column) rather than a login code.
const AUDIT_SUBJECT_IS_EMPLOYEE = new Set([
  "CHECK_IN", "CHECK_OUT", "ATTENDANCE_EDIT", "EMPLOYEE_ADDED", "EMPLOYEE_REMOVED",
  "EMPLOYEE_STATUS_CHANGED", "OVERTIME_CONFIRMED", "REQUEST_SUBMITTED", "REQUEST_APPROVED", "REQUEST_REJECTED"
]);

function auditEventToRow(event) {
  const details = { ...event };
  delete details.id;        // client-generated id is dropped -- Postgres assigns its own UUID
  delete details.eventType;
  delete details.timestamp; // goes to occurred_at, not duplicated inside details

  const row = { event_type: event.eventType, occurred_at: event.timestamp, employee_id: null, acting_login_code: null };

  const actorField = AUDIT_ACTOR_FIELD_BY_EVENT[event.eventType];
  if (actorField && event[actorField] !== undefined) {
    row.acting_login_code = event[actorField];
    delete details[actorField];
  }
  if (AUDIT_SUBJECT_IS_EMPLOYEE.has(event.eventType) && event.employeeId !== undefined) {
    row.employee_id = event.employeeId;
    delete details.employeeId;
  }

  row.details = details;
  return row;
}

function auditEventRowToJs(row) {
  const event = { id: row.id, eventType: row.event_type, timestamp: row.occurred_at, ...(row.details || {}) };
  if (row.employee_id !== null && row.employee_id !== undefined) event.employeeId = row.employee_id;
  const actorField = AUDIT_ACTOR_FIELD_BY_EVENT[row.event_type];
  if (actorField && row.acting_login_code !== null && row.acting_login_code !== undefined) {
    event[actorField] = row.acting_login_code;
  }
  return event;
}

// ================================================================
// PUBLIC API — matches storageService.js's existing method names and
// signatures exactly (see docs/ARCHITECTURE.md -> "Swapping the
// Storage Adapter"), just async now. storageService.js is the only
// file that calls these.
// ================================================================

export const SupabaseService = Object.freeze({
  // ---- Attendance records ----

  async getRecords() {
    const result = await supabase.from("attendance_records").select("*");
    return unwrap(result, "getRecords").map(recordRowToJs);
  },

  /** Not used by the Supabase adapter (bulk-overwrite doesn't map to row-based storage) — see storageService.js. */
  async saveRecords() {
    throw new Error("saveRecords() is not supported by the Supabase adapter — use addRecord()/updateRecord() instead.");
  },

  async addRecord(record) {
    const result = await supabase.from("attendance_records").insert(recordJsToRow(record)).select().single();
    return recordRowToJs(unwrap(result, "addRecord"));
  },

  async updateRecord(employeeId, date, patch) {
    const result = await supabase
      .from("attendance_records")
      .update(recordJsToRow(patch))
      .eq("employee_id", employeeId)
      .eq("record_date", date)
      .select()
      .maybeSingle();
    return recordRowToJs(unwrap(result, "updateRecord"));
  },

  async findRecord(employeeId, date) {
    const result = await supabase
      .from("attendance_records")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("record_date", date)
      .maybeSingle();
    return recordRowToJs(unwrap(result, "findRecord"));
  },

  // ---- Audit log ----

  async getAuditLog() {
    const result = await supabase.from("audit_log").select("*").order("occurred_at", { ascending: true });
    return unwrap(result, "getAuditLog").map(auditEventRowToJs);
  },

  async addAuditEvent(event) {
    const result = await supabase.from("audit_log").insert(auditEventToRow(event));
    unwrap(result, "addAuditEvent");
    return true;
  },

  // ---- Requests ----

  async getRequests() {
    const result = await supabase.from("requests").select("*");
    return unwrap(result, "getRequests").map(requestRowToJs);
  },

  /** Not used by the Supabase adapter (bulk-overwrite doesn't map to row-based storage) — see storageService.js. */
  async saveRequests() {
    throw new Error("saveRequests() is not supported by the Supabase adapter — use addRequest()/updateRequest() instead.");
  },

  /** @returns {object} the created request, INCLUDING the database-assigned id (see requestService.js's use of this return value). */
  async addRequest(request) {
    const result = await supabase.from("requests").insert(requestJsToRow(request)).select().single();
    return requestRowToJs(unwrap(result, "addRequest"));
  },

  async updateRequest(requestId, patch) {
    const result = await supabase.from("requests").update(requestJsToRow(patch)).eq("id", requestId).select().maybeSingle();
    return requestRowToJs(unwrap(result, "updateRequest"));
  },

  // ---- Employee roster ----

  async getRoster() {
    const result = await supabase.from("employees").select("*");
    return unwrap(result, "getRoster").map(employeeRowToJs);
  },

  /**
   * Used only by employeeService.js's one-time seed-if-empty path.
   * Upserts every row so re-seeding an already-populated roster (e.g. the
   * seed data you already ran via 05_seed_data.sql) is a safe no-op.
   */
  async saveRoster(roster) {
    const rows = roster.map((e) => ({ ...employeeJsToRow(e), home_store_id: HOME_STORE_ID }));
    const result = await supabase.from("employees").upsert(rows, { onConflict: "id" });
    unwrap(result, "saveRoster");
    return true;
  },

  /**
   * A true single-row INSERT (not upsert) — fails loudly on a duplicate ID
   * rather than silently overwriting, which is the correct behavior for
   * "add a new employee" (see employeeService.js -> addEmployee()).
   * @param {object} employee
   * @returns {Promise<object>} the created roster row.
   */
  async addEmployeeRow(employee) {
    // employeeJsToRow maps `store` -> home_store_id. Fall back to
    // HOME_STORE_ID only when no store was chosen, preserving the original
    // single-store behavior for any caller that doesn't specify one.
    const mapped = employeeJsToRow(employee);
    const row = { home_store_id: HOME_STORE_ID, ...mapped };
    const result = await supabase.from("employees").insert(row).select().single();
    return employeeRowToJs(unwrap(result, "addEmployeeRow"));
  },

  /** @param {string} employeeId @param {object} patch @returns {Promise<object|null>} the updated roster row. */
  async updateEmployeeRow(employeeId, patch) {
    const result = await supabase.from("employees").update(employeeJsToRow(patch)).eq("id", employeeId).select().maybeSingle();
    return employeeRowToJs(unwrap(result, "updateEmployeeRow"));
  },

  // ---- Store closures ----

  async getClosures() {
    const result = await supabase.from("store_closures").select("*");
    return unwrap(result, "getClosures").map(closureRowToJs);
  },

  /** @param {object} closure @returns {Promise<object>} the created closure row. */
  async addClosureRow(closure) {
    const result = await supabase.from("store_closures").insert(closureJsToRow(closure)).select().single();
    return closureRowToJs(unwrap(result, "addClosureRow"));
  },

  /** Not used by the Supabase adapter (bulk-overwrite doesn't map to row-based storage) — see storageService.js. */
  async saveClosures() {
    throw new Error("saveClosures() is not supported by the Supabase adapter — closures are added/removed one at a time.");
  }
});

// Extra methods beyond storageService.js's original API, needed because a
// real database can do things bulk localStorage couldn't — storageService.js
// exposes these under the same names so callers don't need to know they're new.
export const SupabaseServiceExtras = Object.freeze({
  /** @param {string} employeeId @returns {Promise<boolean>} true if the employee has zero attendance history. */
  async employeeHasNoAttendanceHistory(employeeId) {
    const result = await supabase.from("attendance_records").select("employee_id", { count: "exact", head: true }).eq("employee_id", employeeId);
    unwrap(result, "employeeHasNoAttendanceHistory");
    return (result.count || 0) === 0;
  },

  /** @param {string} employeeId @returns {Promise<boolean>} true if the employee has zero requests. */
  async employeeHasNoRequests(employeeId) {
    const result = await supabase.from("requests").select("employee_id", { count: "exact", head: true }).eq("employee_id", employeeId);
    unwrap(result, "employeeHasNoRequests");
    return (result.count || 0) === 0;
  },

  /** @param {string} employeeId @returns {Promise<boolean>} */
  async deleteEmployee(employeeId) {
    const result = await supabase.from("employees").delete().eq("id", employeeId);
    unwrap(result, "deleteEmployee");
    return true;
  },

  /** @param {string} date - YYYY-MM-DD @returns {Promise<boolean>} */
  async deleteClosure(date) {
    const result = await supabase.from("store_closures").delete().eq("closure_date", date);
    unwrap(result, "deleteClosure");
    return true;
  }
});
