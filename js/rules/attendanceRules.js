/**
 * attendanceRules.js
 * Pure business rules about attendance record state. Every function takes
 * plain data (a record, a Date, a map of users) and returns a plain boolean —
 * no storage or DOM access, so these are trivially unit-testable and safe
 * for validationService.js to compose without circular imports.
 *
 * A "record" always has the shape produced by attendanceEngine.js:
 *   { employeeId, name, store, date, shift, checkInTime, checkOutTime, totalHours, overtimeHours, status }
 */

/**
 * @param {string} employeeId
 * @param {Object<string,object>} usersMap - e.g. config/users.js USERS
 * @returns {boolean} true if the ID belongs to a known account.
 */
export function isKnownEmployee(employeeId, usersMap) {
  return Object.prototype.hasOwnProperty.call(usersMap, employeeId);
}

/**
 * @param {object|null} todayRecord
 * @returns {boolean} true if the employee already has an open (or closed) record for today.
 */
export function hasCheckedInToday(todayRecord) {
  return !!todayRecord;
}

/**
 * @param {object|null} todayRecord
 * @returns {boolean} true if today's record is already checked out (day is locked).
 */
export function isDayLocked(todayRecord) {
  return !!(todayRecord && todayRecord.checkOutTime);
}

/**
 * @param {string} checkInIso
 * @param {Date} now
 * @returns {boolean} true if `now` is somehow before the stored check-in time
 * — guards against clock skew or a stale/edited record producing a negative duration.
 */
export function isCheckoutBeforeCheckin(checkInIso, now) {
  return new Date(checkInIso) > now;
}

/**
 * @param {object} record
 * @param {string} todayDateKey - result of dateUtils.todayKey()
 * @returns {boolean} true if this is a past-day record that was never checked out.
 */
export function isMissingCheckout(record, todayDateKey) {
  return record.date !== todayDateKey && !record.checkOutTime;
}
