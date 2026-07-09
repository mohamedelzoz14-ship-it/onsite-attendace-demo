/**
 * shiftRules.js
 * Pure business rules about a single shift. Every function here takes plain
 * data (a shift object, a Date, a number of minutes) and returns a plain
 * value — no imports of config, storage, or the DOM. This is what makes the
 * rules independently testable and reusable from both shiftEngine.js and
 * validationService.js without any risk of a circular import.
 *
 * A "shift" object always has the shape produced by config/shiftConfig.js:
 *   { label: string, start: number|null, end: number|null }
 * where start/end are minutes-from-midnight, or null for a day off.
 */

/**
 * @param {{start:number|null}} shift
 * @returns {boolean} true if the shift represents a scheduled day off.
 */
export function isDayOff(shift) {
  return shift.start === null;
}

/**
 * @param {{start:number,end:number}} shift
 * @returns {boolean} true if the shift is malformed (missing/NaN bounds).
 * Used by validationService to catch a bad config entry instead of silently
 * mis-calculating attendance for that employee.
 */
export function isValidShift(shift) {
  if (!shift) return false;
  if (shift.start === null && shift.end === null) return true; // valid "day off"
  return Number.isFinite(shift.start) && Number.isFinite(shift.end) && shift.end !== shift.start;
}

/**
 * @param {{end:number|null}} shift
 * @returns {boolean} true if the shift's end time is past midnight (>24:00),
 * i.e. it spans into the next calendar day. None of today's shifts do this
 * (Extended ends exactly at 24:00), but working-hours math below already
 * handles it correctly if a future shift ever does.
 */
export function crossesMidnight(shift) {
  return shift.end !== null && shift.end > 24 * 60;
}

/**
 * @param {{start:number,end:number}} shift
 * @returns {number} scheduled shift length in hours, correctly handling a
 * shift whose end time has wrapped past midnight.
 */
export function computeScheduledHours(shift) {
  if (shift.start === null || shift.end === null) return 0;
  const end = shift.end < shift.start ? shift.end + 24 * 60 : shift.end;
  return (end - shift.start) / 60;
}

/**
 * @param {{start:number}} shift
 * @param {number} minutesSinceMidnight - the employee's check-in time expressed in minutes-from-midnight
 * @param {number} graceMinutes
 * @returns {boolean} true if the check-in is later than shift start + grace.
 */
export function isLate(shift, minutesSinceMidnight, graceMinutes) {
  if (shift.start === null) return false; // day off — not a lateness question
  return minutesSinceMidnight > shift.start + graceMinutes;
}

/**
 * @param {{start:number}} shift
 * @param {number} minutesSinceMidnight
 * @param {number} thresholdMinutes - how early counts as "early" (default 30)
 * @returns {boolean} true if the employee checked in more than `thresholdMinutes` before shift start.
 */
export function isEarly(shift, minutesSinceMidnight, thresholdMinutes = 30) {
  if (shift.start === null) return false;
  return minutesSinceMidnight < shift.start - thresholdMinutes;
}

/**
 * @param {{end:number}} shift
 * @param {number} minutesSinceMidnight - the employee's check-out time expressed in minutes-from-midnight
 * @param {number} thresholdMinutes - how early counts as "left early" (default 30)
 * @returns {boolean} true if the employee checked out more than `thresholdMinutes` before shift end.
 */
export function isEarlyLeave(shift, minutesSinceMidnight, thresholdMinutes = 30) {
  if (shift.end === null) return false;
  return minutesSinceMidnight < shift.end - thresholdMinutes;
}

/**
 * @param {number} workedHours - actual hours worked (from computeWorkingHours)
 * @param {{start:number,end:number}} shift
 * @returns {number} overtime hours (0 if none), rounded to 2 decimals.
 */
export function computeOvertime(workedHours, shift) {
  const scheduled = computeScheduledHours(shift);
  if (scheduled === 0) return 0;
  const overtime = workedHours - scheduled;
  return overtime > 0 ? Math.round(overtime * 100) / 100 : 0;
}

/**
 * Egypt's typical retail "weekend" schedule change lands on Thursday/Friday
 * (the store's Extended shift), rather than the Fri/Sat calendar weekend
 * used elsewhere. This helper exists so that assumption is named and
 * documented in one place instead of being an unexplained `getDay() === 5`
 * scattered through the codebase.
 * @param {number} dayIndex - 0 (Sun) .. 6 (Sat), i.e. `Date#getDay()`
 * @returns {boolean}
 */
export function isExtendedScheduleDay(dayIndex) {
  return dayIndex === 4 || dayIndex === 5; // Thursday, Friday
}

/**
 * @param {string} dateKey - YYYY-MM-DD
 * @param {{date:string,label:string}[]} holidays - config/holidays.js PUBLIC_HOLIDAYS
 * @returns {{date:string,label:string}|null} the matching holiday, or null if `dateKey` isn't one.
 */
export function findHoliday(dateKey, holidays) {
  return holidays.find((h) => h.date === dateKey) || null;
}
