/**
 * shiftEngine.js
 * Resolves "what shift is this employee on today" from config/shiftConfig.js,
 * then delegates every rule decision (late, early, overtime, day-off, valid
 * shift) to the pure functions in rules/shiftRules.js. This file owns *config
 * lookup + caching*; rules/shiftRules.js owns the *business logic*.
 *
 * Public holidays (config/holidays.js) are looked up separately via
 * getHolidayFor() and never override an employee's actual schedule — most
 * retail stores stay open on holidays, so "it's a holiday" must stay purely
 * informational (for holiday-pay flagging) rather than forcing a day off.
 * An employee who genuinely isn't coming in on a holiday needs an approved
 * Planned Leave request instead — see services/requestService.js.
 *
 * Shift lookups are cached per (employeeId, date) — the weekly schedule is
 * static for the lifetime of a page load, so there's no reason to re-index
 * into WEEKLY_SCHEDULE on every call. See clearCache() for tests/reloads.
 */
import { SHIFTS, SHIFT_RULES, WEEKLY_SCHEDULE } from "../config/shiftConfig.js";
import { PUBLIC_HOLIDAYS } from "../config/holidays.js";
import { SHIFT_TYPES } from "../config/constants.js";
import { minutesSinceMidnight, todayKey } from "../utils/dateUtils.js";
import * as ShiftRules from "../rules/shiftRules.js";

const shiftKeyCache = new Map();

function cacheKey(employeeId, date) {
  return `${employeeId}|${todayKey(date)}`;
}

export const ShiftEngine = Object.freeze({
  /**
   * @param {string} employeeId
   * @param {Date} [date]
   * @returns {string} one of config/constants.js SHIFT_TYPES, from the
   * employee's own weekly schedule. A public holiday does NOT change this —
   * most retail stores stay open (and staff work, often for holiday pay) on
   * public holidays, so a holiday must never silently turn into a forced day
   * off. Use getHolidayFor() separately for holiday-pay/reporting purposes.
   */
  getShiftKeyFor(employeeId, date = new Date()) {
    const key = cacheKey(employeeId, date);
    if (shiftKeyCache.has(key)) return shiftKeyCache.get(key);

    const schedule = WEEKLY_SCHEDULE[employeeId];
    const shiftKey = schedule ? schedule[date.getDay()] : SHIFT_TYPES.MORNING; // safe fallback if unscheduled
    shiftKeyCache.set(key, shiftKey);
    return shiftKey;
  },

  /**
   * @param {Date} [date]
   * @returns {{date:string,label:string}|null} the matching public holiday for `date`, if any.
   */
  getHolidayFor(date = new Date()) {
    return ShiftRules.findHoliday(todayKey(date), PUBLIC_HOLIDAYS);
  },

  /**
   * @param {string} employeeId
   * @param {Date} [date]
   * @returns {{label:string, start:number|null, end:number|null}}
   */
  getShiftInfo(employeeId, date = new Date()) {
    return SHIFTS[this.getShiftKeyFor(employeeId, date)];
  },

  /** @returns {boolean} true if `date` is the employee's own scheduled day off (does NOT account for holidays — see getHolidayFor). */
  isDayOff(employeeId, date = new Date()) {
    return ShiftRules.isDayOff(this.getShiftInfo(employeeId, date));
  },

  /** @returns {boolean} true if the resolved shift is a well-formed config entry. */
  isValidShift(employeeId, date = new Date()) {
    return ShiftRules.isValidShift(this.getShiftInfo(employeeId, date));
  },

  /** @returns {boolean} true if `checkInDate` is later than shift start + grace. */
  isLate(employeeId, checkInDate = new Date()) {
    const shift = this.getShiftInfo(employeeId, checkInDate);
    return ShiftRules.isLate(shift, minutesSinceMidnight(checkInDate), SHIFT_RULES.lateGraceMinutes);
  },

  /** @returns {boolean} true if `checkInDate` is well before shift start (see shiftRules.isEarly). */
  isEarly(employeeId, checkInDate = new Date()) {
    const shift = this.getShiftInfo(employeeId, checkInDate);
    return ShiftRules.isEarly(shift, minutesSinceMidnight(checkInDate));
  },

  /** @returns {boolean} true if `checkOutDate` is well before shift end (see shiftRules.isEarlyLeave). */
  isEarlyLeave(employeeId, checkOutDate = new Date()) {
    const shift = this.getShiftInfo(employeeId, checkOutDate);
    return ShiftRules.isEarlyLeave(shift, minutesSinceMidnight(checkOutDate));
  },

  /** @returns {number} worked hours between two ISO timestamps, rounded to 2 decimals. */
  computeWorkingHours(checkInIso, checkOutIso) {
    const ms = new Date(checkOutIso) - new Date(checkInIso);
    return Math.round((ms / 3600000) * 100) / 100;
  },

  /** @returns {number} overtime hours beyond the employee's scheduled shift length that day (0 if none). */
  computeOvertime(employeeId, checkInDate, workedHours) {
    const shift = this.getShiftInfo(employeeId, checkInDate);
    return ShiftRules.computeOvertime(workedHours, shift);
  },

  /** Clears the shift lookup cache. Exposed for tests and for a future "schedule changed" event. */
  clearCache() {
    shiftKeyCache.clear();
  }
});
