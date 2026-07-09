/**
 * employeeRules.js
 * Pure rules about employee roster membership — active/inactive, and
 * whether an employee can be safely deleted. Same contract as the other
 * /rules files: plain data in, plain boolean out, no storage or DOM imports.
 *
 * An "employee" here has the shape from config/users.js SEED_ROSTER /
 * services/employeeService.js: { id, name, endDate, endReason, transferredTo }
 */

/**
 * @param {{startDate:string|null, endDate:string|null}} employee
 * @param {string} dateKey - YYYY-MM-DD
 * @returns {boolean} true if the employee was/is active on this store's
 * roster on this date — on/after their join date (if one is set), and
 * on/before their last active day (if one is set).
 */
export function isActiveOn(employee, dateKey) {
  if (employee.startDate && dateKey < employee.startDate) return false;
  return !employee.endDate || dateKey <= employee.endDate;
}

/**
 * An employee can only be hard-deleted (removed entirely) if they have zero
 * attendance history and zero requests — otherwise "remove" would silently
 * destroy real data. Anyone with history should be marked resigned/transferred
 * instead (setEmployeeStatus), which keeps their records intact.
 * @param {boolean} hasAttendanceHistory
 * @param {boolean} hasRequests
 * @returns {boolean}
 */
export function canRemoveEmployee(hasAttendanceHistory, hasRequests) {
  return !hasAttendanceHistory && !hasRequests;
}

/** @param {string} name @returns {boolean} */
export function isValidName(name) {
  return typeof name === "string" && name.trim().length >= 2;
}

/** @param {string} dateStr @returns {boolean} true if `dateStr` is a well-formed, parseable YYYY-MM-DD date. Used for both a join date and an end date. */
export function isValidDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  return !Number.isNaN(new Date(dateStr).getTime());
}
