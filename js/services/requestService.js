/**
 * requestService.js
 * Orchestrates the employee → manager request lifecycle: submit, approve,
 * reject. MISSED_CHECKOUT_CORRECTION, PLANNED_LEAVE, SICK_LEAVE, and
 * EARLY_LEAVE all have real submit flows sharing the same plumbing
 * (storage shape, approve/reject, Pending Requests list, audit logging).
 *
 * Like attendanceEngine.js, every public method returns
 * { ok, data, code } instead of throwing.
 *
 * Migration note: every method is now `async` — no business rule changed.
 * The one real adaptation: request IDs used to be generated client-side
 * (`req-<timestamp>-<sequence>`) before being saved. The database now
 * assigns a proper UUID on insert, so each submit* method sends the
 * request WITHOUT an `id`, then uses the row StorageService.addRequest()
 * hands back (which includes the database-assigned id) for the audit log
 * and the returned result — nothing about WHEN a request gets an ID or
 * what that ID is used for changed, only WHO assigns it.
 */
import { StorageService } from "./storageService.js";
import { ShiftEngine } from "./shiftEngine.js";
import { AuditService } from "./auditService.js";
import * as RequestRules from "../rules/requestRules.js";
import {
  ATTENDANCE_STATUS,
  REQUEST_STATUS,
  REQUEST_TYPES,
  NOTIFICATION_CODES as CODE
} from "../config/constants.js";
import { todayKey } from "../utils/dateUtils.js";

function result(ok, data, code) {
  return { ok, data: data || null, code: code || null };
}

export const RequestService = Object.freeze({
  /**
   * Submits a correction for a day the app marked "missing check-out".
   * @param {string} employeeId
   * @param {string} employeeName
   * @param {string} targetDate - YYYY-MM-DD, the record being corrected
   * @param {string} proposedCheckOutIso - the check-out time the employee says is correct
   * @param {string} reason - free-text note shown to the manager
   * @returns {Promise<{ok:boolean, data:object|null, code:string|null}>}
   */
  async submitMissedCheckoutCorrection(employeeId, employeeName, targetDate, proposedCheckOutIso, reason) {
    try {
      const record = await StorageService.findRecord(employeeId, targetDate);
      if (!RequestRules.canRequestMissedCheckoutCorrection(record)) {
        return result(false, null, CODE.REQUEST_INVALID_RECORD);
      }
      if (!RequestRules.isValidProposedCheckout(proposedCheckOutIso, record.checkInTime)) {
        return result(false, null, CODE.REQUEST_INVALID_TIME);
      }
      const allRequests = await StorageService.getRequests();
      const existing = allRequests.filter((r) => r.employeeId === employeeId);
      if (RequestRules.hasPendingRequestFor(existing, employeeId, targetDate)) {
        return result(false, null, CODE.REQUEST_ALREADY_PENDING);
      }

      const request = {
        type: REQUEST_TYPES.MISSED_CHECKOUT_CORRECTION,
        employeeId,
        employeeName,
        targetDate,
        reason: reason || "",
        payload: { proposedCheckOutTime: proposedCheckOutIso },
        status: REQUEST_STATUS.PENDING,
        requestedAt: new Date().toISOString(),
        reviewedAt: null,
        reviewedBy: null,
        reviewNote: null
      };

      const created = await StorageService.addRequest(request);
      await AuditService.logRequestSubmitted(created);
      return result(true, created, CODE.REQUEST_SUBMITTED);
    } catch (error) {
      await AuditService.logError("requestService.submitMissedCheckoutCorrection", error);
      return result(false, null, CODE.GENERIC_ERROR);
    }
  },

  /** @param {string} employeeId @returns {Promise<object[]>} every request this employee has submitted, newest first. */
  async getRequestsForEmployee(employeeId) {
    const requests = await StorageService.getRequests();
    return requests.filter((r) => r.employeeId === employeeId).sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
  },

  /**
   * Submits a planned (annual/personal) leave request for a future or
   * today's date. Unlike a missed-checkout correction, this doesn't touch
   * any existing attendance record — it just needs review before the date
   * arrives, so the employee is excluded from "Absent" if approved.
   * @param {string} employeeId
   * @param {string} employeeName
   * @param {string} targetDate - YYYY-MM-DD
   * @param {string} reason
   * @returns {Promise<{ok:boolean, data:object|null, code:string|null}>}
   */
  async submitPlannedLeave(employeeId, employeeName, targetDate, reason) {
    try {
      if (!RequestRules.isFutureOrTodayDate(targetDate, todayKey())) {
        return result(false, null, CODE.REQUEST_INVALID_DATE);
      }
      if (await StorageService.findRecord(employeeId, targetDate)) {
        return result(false, null, CODE.REQUEST_DATE_ALREADY_RECORDED);
      }

      const allRequests = await StorageService.getRequests();
      const existing = allRequests.filter((r) => r.employeeId === employeeId);
      if (RequestRules.hasPendingRequestFor(existing, employeeId, targetDate)) {
        return result(false, null, CODE.REQUEST_ALREADY_PENDING);
      }
      if (RequestRules.hasApprovedLeaveFor(existing, employeeId, targetDate)) {
        return result(false, null, CODE.REQUEST_ALREADY_APPROVED);
      }

      const request = {
        type: REQUEST_TYPES.PLANNED_LEAVE,
        employeeId,
        employeeName,
        targetDate,
        reason: reason || "",
        payload: {},
        status: REQUEST_STATUS.PENDING,
        requestedAt: new Date().toISOString(),
        reviewedAt: null,
        reviewedBy: null,
        reviewNote: null
      };

      const created = await StorageService.addRequest(request);
      await AuditService.logRequestSubmitted(created);
      return result(true, created, CODE.REQUEST_SUBMITTED);
    } catch (error) {
      await AuditService.logError("requestService.submitPlannedLeave", error);
      return result(false, null, CODE.GENERIC_ERROR);
    }
  },

  /**
   * Submits a sick-leave request. Unlike submitPlannedLeave(), any date is
   * allowed — including a past date — since sick leave is often reported
   * after the fact (the employee wasn't well enough to log in that day).
   * The only real guard is: the day can't already have attendance recorded.
   * @param {string} employeeId
   * @param {string} employeeName
   * @param {string} targetDate - YYYY-MM-DD
   * @param {string} reason
   * @returns {Promise<{ok:boolean, data:object|null, code:string|null}>}
   */
  async submitSickLeave(employeeId, employeeName, targetDate, reason) {
    try {
      if (await StorageService.findRecord(employeeId, targetDate)) {
        return result(false, null, CODE.REQUEST_DATE_ALREADY_RECORDED);
      }

      const allRequests = await StorageService.getRequests();
      const existing = allRequests.filter((r) => r.employeeId === employeeId);
      if (RequestRules.hasPendingRequestFor(existing, employeeId, targetDate)) {
        return result(false, null, CODE.REQUEST_ALREADY_PENDING);
      }
      if (RequestRules.hasApprovedLeaveFor(existing, employeeId, targetDate)) {
        return result(false, null, CODE.REQUEST_ALREADY_APPROVED);
      }

      const request = {
        type: REQUEST_TYPES.SICK_LEAVE,
        employeeId,
        employeeName,
        targetDate,
        reason: reason || "",
        payload: {},
        status: REQUEST_STATUS.PENDING,
        requestedAt: new Date().toISOString(),
        reviewedAt: null,
        reviewedBy: null,
        reviewNote: null
      };

      const created = await StorageService.addRequest(request);
      await AuditService.logRequestSubmitted(created);
      return result(true, created, CODE.REQUEST_SUBMITTED);
    } catch (error) {
      await AuditService.logError("requestService.submitSickLeave", error);
      return result(false, null, CODE.GENERIC_ERROR);
    }
  },

  /**
   * @param {string} employeeId
   * @param {string} targetDate - YYYY-MM-DD
   * @returns {Promise<boolean>} true if this employee has an approved planned/sick
   * leave request covering this exact date. Used by attendanceEngine to
   * block check-in and by reportsService to keep the day out of "Absent".
   */
  async hasApprovedLeaveFor(employeeId, targetDate) {
    const requests = await StorageService.getRequests();
    return RequestRules.hasApprovedLeaveFor(requests.filter((r) => r.employeeId === employeeId), employeeId, targetDate);
  },

  /**
   * Requests permission to leave before the shift ends — either ahead of
   * time (a known appointment) or after already leaving early (asking
   * forgiveness instead of permission). Doesn't touch or require an
   * existing attendance record; approval's effect on the record (if one
   * exists yet) happens in approveRequest().
   * @param {string} employeeId
   * @param {string} employeeName
   * @param {string} targetDate - YYYY-MM-DD
   * @param {string} reason
   * @param {string} [expectedTime] - "HH:MM", optional — the employee's estimate of when they'll leave
   * @returns {Promise<{ok:boolean, data:object|null, code:string|null}>}
   */
  async submitEarlyLeave(employeeId, employeeName, targetDate, reason, expectedTime) {
    try {
      const allRequests = await StorageService.getRequests();
      const existing = allRequests.filter((r) => r.employeeId === employeeId);
      if (RequestRules.hasPendingRequestFor(existing, employeeId, targetDate)) {
        return result(false, null, CODE.REQUEST_ALREADY_PENDING);
      }

      const request = {
        type: REQUEST_TYPES.EARLY_LEAVE,
        employeeId,
        employeeName,
        targetDate,
        reason: reason || "",
        payload: { expectedTime: expectedTime || null },
        status: REQUEST_STATUS.PENDING,
        requestedAt: new Date().toISOString(),
        reviewedAt: null,
        reviewedBy: null,
        reviewNote: null
      };

      const created = await StorageService.addRequest(request);
      await AuditService.logRequestSubmitted(created);
      return result(true, created, CODE.REQUEST_SUBMITTED);
    } catch (error) {
      await AuditService.logError("requestService.submitEarlyLeave", error);
      return result(false, null, CODE.GENERIC_ERROR);
    }
  },

  /**
   * @param {string} employeeId
   * @param {string} targetDate - YYYY-MM-DD
   * @returns {Promise<boolean>} true if this employee has an approved early-leave
   * request for this date. Never treated as a day off — see
   * rules/requestRules.hasApprovedEarlyLeaveFor() for why this is kept
   * separate from hasApprovedLeaveFor().
   */
  async hasApprovedEarlyLeaveFor(employeeId, targetDate) {
    const requests = await StorageService.getRequests();
    return RequestRules.hasApprovedEarlyLeaveFor(requests.filter((r) => r.employeeId === employeeId), employeeId, targetDate);
  },

  /** @returns {Promise<object[]>} every request still awaiting review, oldest first (first in line, first reviewed). */
  async getPendingRequests() {
    const requests = await StorageService.getRequests();
    return requests.filter((r) => r.status === REQUEST_STATUS.PENDING).sort((a, b) => (a.requestedAt > b.requestedAt ? 1 : -1));
  },

  /**
   * Approves a request and applies its correction to the underlying
   * attendance record. For MISSED_CHECKOUT_CORRECTION: sets the check-out
   * time, recomputes worked/overtime hours, and recomputes the day's status
   * (present/late) — it does NOT just blindly clear "missing", it re-derives
   * the correct status from the shift rules so a late arrival that also
   * forgot to check out doesn't quietly become "present".
   * @param {string} requestId
   * @param {string} reviewerId
   * @param {string} [reviewNote]
   * @returns {Promise<{ok:boolean, data:object|null, code:string|null}>}
   */
  async approveRequest(requestId, reviewerId, reviewNote = "") {
    try {
      const requests = await StorageService.getRequests();
      const request = requests.find((r) => r.id === requestId);
      if (!request) return result(false, null, CODE.REQUEST_NOT_FOUND);
      if (!RequestRules.isPending(request)) return result(false, request, CODE.REQUEST_ALREADY_REVIEWED);

      if (request.type === REQUEST_TYPES.MISSED_CHECKOUT_CORRECTION) {
        const record = await StorageService.findRecord(request.employeeId, request.targetDate);
        if (!record) return result(false, request, CODE.REQUEST_INVALID_RECORD);
        const beforeRecord = { ...record };

        const checkOutIso = request.payload.proposedCheckOutTime;
        const totalHours = ShiftEngine.computeWorkingHours(record.checkInTime, checkOutIso);
        const overtimeHours = ShiftEngine.computeOvertime(request.employeeId, new Date(record.checkInTime), totalHours);
        const status = ShiftEngine.isLate(request.employeeId, new Date(record.checkInTime))
          ? ATTENDANCE_STATUS.LATE
          : ATTENDANCE_STATUS.PRESENT;

        const patch = { checkOutTime: checkOutIso, totalHours, overtimeHours, status, overtimeConfirmed: overtimeHours > 0 ? false : true };
        const updated = await StorageService.updateRecord(request.employeeId, request.targetDate, patch);
        await AuditService.logAttendanceEdit(request.employeeId, beforeRecord, updated);
      }

      if (request.type === REQUEST_TYPES.EARLY_LEAVE) {
        // Two cases, handled by the same code: (1) approved BEFORE the employee
        // checks out — nothing to patch yet, attendanceEngine.checkOut() will
        // see the approval live via hasApprovedEarlyLeaveFor() and record it
        // as authorized from the start. (2) approved AFTER an already-recorded
        // early checkout (the employee left early, then asked) — that record
        // exists with earlyLeaveAuthorized:false, so patch it to true now.
        const record = await StorageService.findRecord(request.employeeId, request.targetDate);
        if (record && record.earlyLeave && !record.earlyLeaveAuthorized) {
          const beforeRecord = { ...record };
          const updated = await StorageService.updateRecord(request.employeeId, request.targetDate, { earlyLeaveAuthorized: true });
          await AuditService.logAttendanceEdit(request.employeeId, beforeRecord, updated);
        }
      }

      const updatedRequest = await StorageService.updateRequest(requestId, {
        status: REQUEST_STATUS.APPROVED,
        reviewedAt: new Date().toISOString(),
        reviewedBy: reviewerId,
        reviewNote
      });
      await AuditService.logRequestReviewed(updatedRequest, true);

      return result(true, updatedRequest, CODE.REQUEST_APPROVED);
    } catch (error) {
      await AuditService.logError("requestService.approveRequest", error);
      return result(false, null, CODE.GENERIC_ERROR);
    }
  },

  /**
   * @param {string} requestId
   * @param {string} reviewerId
   * @param {string} [reviewNote]
   * @returns {Promise<{ok:boolean, data:object|null, code:string|null}>}
   */
  async rejectRequest(requestId, reviewerId, reviewNote = "") {
    try {
      const requests = await StorageService.getRequests();
      const request = requests.find((r) => r.id === requestId);
      if (!request) return result(false, null, CODE.REQUEST_NOT_FOUND);
      if (!RequestRules.isPending(request)) return result(false, request, CODE.REQUEST_ALREADY_REVIEWED);

      const updatedRequest = await StorageService.updateRequest(requestId, {
        status: REQUEST_STATUS.REJECTED,
        reviewedAt: new Date().toISOString(),
        reviewedBy: reviewerId,
        reviewNote
      });
      await AuditService.logRequestReviewed(updatedRequest, false);

      return result(true, updatedRequest, CODE.REQUEST_REJECTED);
    } catch (error) {
      await AuditService.logError("requestService.rejectRequest", error);
      return result(false, null, CODE.GENERIC_ERROR);
    }
  }
});
