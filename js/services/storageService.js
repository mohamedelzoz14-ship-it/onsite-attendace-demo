/**
 * storageService.js
 * The single gateway to persistence that every engine/service calls.
 * Every method name below is UNCHANGED from the localStorage-era version
 * (see docs/ARCHITECTURE.md) — every caller (attendanceEngine.js,
 * requestService.js, employeeService.js, closureService.js, auditService.js,
 * reportsService.js, dmReportsService.js) keeps calling StorageService.xxx()
 * exactly as before. The only two things that changed:
 *
 *   1. Every method is now `async` (Supabase calls are network requests) —
 *      every call site now needs `await`, but nothing about WHICH method
 *      to call, or what it returns, changed shape.
 *   2. The in-memory read cache from the localStorage era was removed.
 *      That cache was specifically an optimization for a SINGLE device
 *      reading its own localStorage repeatedly; caching now would mean one
 *      device not seeing another device's check-in — exactly the problem
 *      this migration exists to solve. Every read hits the database directly.
 *
 * A few NEW methods were added at the bottom (clearly marked) for
 * employeeService.js and closureService.js, which used to read a whole
 * table into a JS array, mutate it, and save the whole array back — a
 * pattern that fit localStorage well but doesn't fit a real database
 * (rewriting every row just to add one is wasteful and racy). Those two
 * services now use targeted single-row operations instead; their own
 * PUBLIC method names (addEmployee, removeEmployee, addClosure, etc.,
 * called from adminPage.js) are completely unchanged — only what they
 * call internally, in this file, is different.
 */
import { SupabaseService, SupabaseServiceExtras } from "./supabaseService.js";

export const StorageService = Object.freeze({
  // ---- Attendance records ----

  /** @returns {Promise<object[]>} every attendance record ever saved (all employees, all dates). */
  async getRecords() {
    return SupabaseService.getRecords();
  },

  /** @param {object} record @returns {Promise<object>} the created record. */
  async addRecord(record) {
    return SupabaseService.addRecord(record);
  },

  /**
   * Finds a record by employeeId + date and applies `patch` to it.
   * @param {string} employeeId
   * @param {string} date - YYYY-MM-DD
   * @param {object} patch
   * @returns {Promise<object|null>} the updated record, or null if no match was found.
   */
  async updateRecord(employeeId, date, patch) {
    return SupabaseService.updateRecord(employeeId, date, patch);
  },

  /** @param {string} employeeId @param {string} date @returns {Promise<object|null>} */
  async findRecord(employeeId, date) {
    return SupabaseService.findRecord(employeeId, date);
  },

  // ---- Audit log ----

  /** @returns {Promise<object[]>} every audit event ever recorded, oldest first. */
  async getAuditLog() {
    return SupabaseService.getAuditLog();
  },

  /**
   * Appends one audit event. Audit events are append-only — nothing in the
   * app ever edits or removes a past entry (the database enforces this too
   * — see onsite-supabase/01_schema.sql's audit_log triggers).
   * @param {object} event
   * @returns {Promise<boolean>}
   */
  async addAuditEvent(event) {
    return SupabaseService.addAuditEvent(event);
  },

  // ---- Employee → manager requests (leave, corrections, etc.) ----

  /** @returns {Promise<object[]>} every request ever submitted, any status. */
  async getRequests() {
    return SupabaseService.getRequests();
  },

  /** @param {object} request @returns {Promise<object>} the created request, INCLUDING the database-assigned `id`. */
  async addRequest(request) {
    return SupabaseService.addRequest(request);
  },

  /**
   * @param {string} requestId
   * @param {object} patch
   * @returns {Promise<object|null>} the updated request, or null if no match was found.
   */
  async updateRequest(requestId, patch) {
    return SupabaseService.updateRequest(requestId, patch);
  },

  // ---- Employee roster ----

  /** @returns {Promise<object[]>} the current roster (employeeService seeds it on first use if empty). */
  async getRoster() {
    return SupabaseService.getRoster();
  },

  /** Bulk upsert — used ONLY by employeeService.js's one-time seed-if-empty path. @param {object[]} roster @returns {Promise<boolean>} */
  async saveRoster(roster) {
    return SupabaseService.saveRoster(roster);
  },

  // ---- Store closures (admin-declared: power cut, weather, etc.) ----

  /** @returns {Promise<object[]>} every declared closure, any date, unordered. */
  async getClosures() {
    return SupabaseService.getClosures();
  },

  // ================================================================
  // NEW — targeted single-row operations. Additive only; nothing above
  // this line changed its name or signature.
  // ================================================================

  /** @param {object} employee @returns {Promise<object>} the created roster row. */
  async insertEmployee(employee) {
    return SupabaseService.addEmployeeRow(employee);
  },

  /** @param {string} employeeId @param {object} patch @returns {Promise<object|null>} the updated roster row. */
  async updateEmployeeRow(employeeId, patch) {
    return SupabaseService.updateEmployeeRow(employeeId, patch);
  },

  /** @param {string} employeeId @returns {Promise<boolean>} */
  async deleteEmployee(employeeId) {
    return SupabaseServiceExtras.deleteEmployee(employeeId);
  },

  /** @param {string} employeeId @returns {Promise<boolean>} true if this employee has at least one attendance record. */
  async employeeHasAttendanceHistory(employeeId) {
    return !(await SupabaseServiceExtras.employeeHasNoAttendanceHistory(employeeId));
  },

  /** @param {string} employeeId @returns {Promise<boolean>} true if this employee has at least one request. */
  async employeeHasRequests(employeeId) {
    return !(await SupabaseServiceExtras.employeeHasNoRequests(employeeId));
  },

  /** @param {object} closure @returns {Promise<object>} the created closure row. */
  async insertClosure(closure) {
    return SupabaseService.addClosureRow(closure);
  },

  /** @param {string} date - YYYY-MM-DD @returns {Promise<boolean>} */
  async deleteClosure(date) {
    return SupabaseServiceExtras.deleteClosure(date);
  }
});
