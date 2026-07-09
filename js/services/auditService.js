/**
 * auditService.js
 * Records a durable, append-only trail of what happened in the app: logins,
 * logouts, check-ins, check-outs, attendance edits, and errors. Every other
 * service calls AuditService.log(...) at the point an action succeeds or
 * fails — it never has to know *how* the log is stored (that's StorageService).
 *
 * Migration note: every method is now `async` (StorageService now talks to
 * Supabase, a network call) — no method name, parameter, or event shape
 * changed. Callers that already did `AuditService.logCheckIn(...)` without
 * awaiting it (fire-and-forget style) still work; the write just completes
 * a little later. Callers that need to be sure the write finished should
 * `await` these calls, same as any other StorageService-backed method.
 */
import { StorageService } from "./storageService.js";
import { AUDIT_EVENTS } from "../config/constants.js";

let sequence = 0;

/**
 * @param {string} eventType - one of config/constants.js AUDIT_EVENTS
 * @param {object} [details] - event-specific payload, e.g. { employeeId, status }
 * @returns {Promise<object>} the event that was recorded
 */
async function record(eventType, details = {}) {
  sequence += 1;
  const event = {
    id: `${Date.now()}-${sequence}`,
    eventType,
    timestamp: new Date().toISOString(),
    ...details
  };
  await StorageService.addAuditEvent(event);
  return event;
}

export const AuditService = Object.freeze({
  async logLogin(employeeId, role) {
    return record(AUDIT_EVENTS.LOGIN, { employeeId, role });
  },

  async logLogout(employeeId) {
    return record(AUDIT_EVENTS.LOGOUT, { employeeId });
  },

  async logCheckIn(employeeId, record_) {
    return record(AUDIT_EVENTS.CHECK_IN, {
      employeeId,
      status: record_.status,
      shift: record_.shift,
      checkInTime: record_.checkInTime
    });
  },

  async logCheckOut(employeeId, record_) {
    return record(AUDIT_EVENTS.CHECK_OUT, {
      employeeId,
      checkOutTime: record_.checkOutTime,
      totalHours: record_.totalHours,
      overtimeHours: record_.overtimeHours
    });
  },

  /** For future admin edits to a saved record (not wired to any UI yet). */
  async logAttendanceEdit(employeeId, before, after) {
    return record(AUDIT_EVENTS.ATTENDANCE_EDIT, { employeeId, before, after });
  },

  async logEmployeeAdded(employee, actingAdminId) {
    return record(AUDIT_EVENTS.EMPLOYEE_ADDED, { employeeId: employee.id, name: employee.name, actingAdminId });
  },

  async logEmployeeRemoved(employee, actingAdminId) {
    // Store the removed person's id/name under distinct keys that live in
    // the details JSON (NOT the employee_id FK column, which nulls out when
    // the employee row is deleted). This keeps a permanent record of who was
    // removed even after they no longer exist in the employees table.
    return record(AUDIT_EVENTS.EMPLOYEE_REMOVED, { removedEmployeeId: employee.id, removedName: employee.name, actingAdminId });
  },

  async logEmployeeStatusChanged(before, after, actingAdminId) {
    return record(AUDIT_EVENTS.EMPLOYEE_STATUS_CHANGED, {
      employeeId: after.id,
      before: { endDate: before.endDate, endReason: before.endReason, transferredTo: before.transferredTo },
      after: { endDate: after.endDate, endReason: after.endReason, transferredTo: after.transferredTo },
      actingAdminId
    });
  },

  /**
   * Records that a store manager reviewed and confirmed a day's overtime
   * hours are accurate. This is a data confirmation, not a payroll decision —
   * actual pay calculation and payment happen entirely outside this app.
   */
  async logOvertimeConfirmed(employeeId, record_, actingAdminId) {
    return record(AUDIT_EVENTS.OVERTIME_CONFIRMED, {
      employeeId,
      date: record_.date,
      overtimeHours: record_.overtimeHours,
      actingAdminId
    });
  },

  async logClosureAdded(closure, actingAdminId) {
    return record(AUDIT_EVENTS.CLOSURE_ADDED, { date: closure.date, reason: closure.reason, actingAdminId });
  },

  async logClosureRemoved(closure, actingAdminId) {
    return record(AUDIT_EVENTS.CLOSURE_REMOVED, { date: closure.date, actingAdminId });
  },

  async logRequestSubmitted(request) {
    return record(AUDIT_EVENTS.REQUEST_SUBMITTED, {
      requestId: request.id,
      employeeId: request.employeeId,
      type: request.type,
      targetDate: request.targetDate
    });
  },

  /**
   * @param {object} request - the request after its status was updated
   * @param {boolean} approved
   */
  async logRequestReviewed(request, approved) {
    return record(approved ? AUDIT_EVENTS.REQUEST_APPROVED : AUDIT_EVENTS.REQUEST_REJECTED, {
      requestId: request.id,
      employeeId: request.employeeId,
      reviewedBy: request.reviewedBy
    });
  },

  /**
   * @param {string} context - which module/action failed, e.g. "employeePage.checkIn"
   * @param {Error|string} error
   */
  async logError(context, error) {
    try {
      return await record(AUDIT_EVENTS.ERROR, {
        context,
        message: error && error.message ? error.message : String(error)
      });
    } catch (loggingError) {
      // The one place we do NOT rethrow: if logging the error itself fails
      // (e.g. the database is unreachable), fall back to the console rather
      // than let a failed error-log mask the original error being reported.
      console.error("AuditService.logError: failed to write to the audit log.", loggingError);
      console.error("Original error being logged:", context, error);
      return null;
    }
  },

  /** @returns {Promise<object[]>} the full audit trail, oldest first. Not shown in any UI yet. */
  async getLog() {
    return StorageService.getAuditLog();
  }
});
