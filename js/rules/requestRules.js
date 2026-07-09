/**
 * requestRules.js
 * Pure rules about the employee → manager request lifecycle. Same contract
 * as the other /rules files: plain data in, plain boolean out, no storage
 * or DOM imports.
 *
 * A "request" has the shape produced by requestService.js:
 *   { id, type, employeeId, employeeName, targetDate, reason, payload,
 *     status, requestedAt, reviewedAt, reviewedBy, reviewNote }
 */
import { ATTENDANCE_STATUS, REQUEST_STATUS, REQUEST_TYPES } from "../config/constants.js";

/**
 * A missed-checkout correction only makes sense against a record the app
 * itself flagged as missing a check-out — never against a normal day.
 * @param {object|null} record
 * @returns {boolean}
 */
export function canRequestMissedCheckoutCorrection(record) {
  return !!record && record.status === ATTENDANCE_STATUS.MISSING_CHECKOUT;
}

/**
 * @param {string} proposedCheckOutIso
 * @param {string} checkInIso
 * @returns {boolean} true if the proposed check-out is after the recorded check-in.
 */
export function isValidProposedCheckout(proposedCheckOutIso, checkInIso) {
  const proposed = new Date(proposedCheckOutIso);
  if (Number.isNaN(proposed.getTime())) return false;
  return proposed > new Date(checkInIso);
}

/**
 * Planned leave only makes sense for today or a future date — you don't
 * "request" leave for a day that already happened.
 * @param {string} targetDate - YYYY-MM-DD
 * @param {string} todayDate - YYYY-MM-DD, from dateUtils.todayKey()
 * @returns {boolean}
 */
export function isFutureOrTodayDate(targetDate, todayDate) {
  return targetDate >= todayDate;
}

/**
 * @param {object[]} existingRequests - all requests for this employee
 * @param {string} targetDate
 * @returns {boolean} true if a request for this employee+date is still awaiting review.
 */
export function hasPendingRequestFor(existingRequests, employeeId, targetDate) {
  return existingRequests.some(
    (r) => r.employeeId === employeeId && r.targetDate === targetDate && r.status === REQUEST_STATUS.PENDING
  );
}

/**
 * @param {object[]} existingRequests - all requests for this employee
 * @param {string} employeeId
 * @param {string} targetDate
 * @returns {boolean} true if a leave request (planned or sick) for this
 * employee+date has already been approved.
 */
export function hasApprovedLeaveFor(existingRequests, employeeId, targetDate) {
  return existingRequests.some(
    (r) =>
      r.employeeId === employeeId &&
      r.targetDate === targetDate &&
      r.status === REQUEST_STATUS.APPROVED &&
      (r.type === REQUEST_TYPES.PLANNED_LEAVE || r.type === REQUEST_TYPES.SICK_LEAVE)
  );
}

/**
 * Separate from hasApprovedLeaveFor() on purpose: an approved early-leave
 * request authorizes leaving early on a day the employee IS working — it
 * never means "day off" and must never block check-in the way planned/sick
 * leave does.
 * @param {object[]} existingRequests
 * @param {string} employeeId
 * @param {string} targetDate
 * @returns {boolean}
 */
export function hasApprovedEarlyLeaveFor(existingRequests, employeeId, targetDate) {
  return existingRequests.some(
    (r) =>
      r.employeeId === employeeId &&
      r.targetDate === targetDate &&
      r.status === REQUEST_STATUS.APPROVED &&
      r.type === REQUEST_TYPES.EARLY_LEAVE
  );
}

/** @param {object} request @returns {boolean} */
export function isPending(request) {
  return !!request && request.status === REQUEST_STATUS.PENDING;
}
