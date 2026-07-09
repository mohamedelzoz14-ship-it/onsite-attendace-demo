/**
 * validationService.js
 * The single place attendance validation decisions get made. It composes the
 * pure functions in /rules — it does not itself decide *how* to compute
 * lateness or overtime, only *whether an action is allowed right now*.
 *
 * Callers (attendanceEngine.js) gather the facts (today's record, the
 * resolved shift, whether the employee ID is known) and pass them in; this
 * keeps validationService free of storage/config imports and therefore easy
 * to unit test in isolation.
 *
 * Every method returns { valid: boolean, code?: string } where `code` is a
 * config/constants.js NOTIFICATION_CODES value the caller can hand to
 * NotificationService.get() for display text.
 */
import * as ShiftRules from "../rules/shiftRules.js";
import * as AttendanceRules from "../rules/attendanceRules.js";
import { NOTIFICATION_CODES as CODE } from "../config/constants.js";

function fail(code) {
  return { valid: false, code };
}
function ok() {
  return { valid: true };
}

export const ValidationService = Object.freeze({
  /**
   * @param {object} ctx
   * @param {boolean} ctx.isKnownEmployee
   * @param {boolean} [ctx.isActiveEmployee] - false if resigned/transferred out as of today (defaults true for callers that don't track this)
   * @param {boolean} [ctx.isStoreClosed] - true if the admin declared a full closure for today
   * @param {{start:number|null,end:number|null}} ctx.shift
   * @param {object|null} ctx.todayRecord
   * @param {boolean} [ctx.onApprovedLeave] - true if an approved planned/sick leave request covers today
   * @returns {{valid:boolean, code?:string}}
   */
  validateCheckIn({ isKnownEmployee, isActiveEmployee = true, isStoreClosed = false, shift, todayRecord, onApprovedLeave }) {
    if (!isKnownEmployee) return fail(CODE.INVALID_EMPLOYEE);
    if (!isActiveEmployee) return fail(CODE.EMPLOYEE_INACTIVE);
    if (isStoreClosed) return fail(CODE.STORE_CLOSED_TODAY);
    if (onApprovedLeave) return fail(CODE.ON_APPROVED_LEAVE);
    if (!ShiftRules.isValidShift(shift)) return fail(CODE.INVALID_SHIFT);
    if (ShiftRules.isDayOff(shift)) return fail(CODE.DAY_OFF_TODAY);
    if (AttendanceRules.isDayLocked(todayRecord)) return fail(CODE.ALREADY_COMPLETED);
    if (AttendanceRules.hasCheckedInToday(todayRecord)) return fail(CODE.ALREADY_CHECKED_IN);
    return ok();
  },

  /**
   * @param {object} ctx
   * @param {object|null} ctx.todayRecord
   * @param {Date} ctx.now
   * @returns {{valid:boolean, code?:string}}
   */
  validateCheckOut({ todayRecord, now }) {
    if (!AttendanceRules.hasCheckedInToday(todayRecord)) return fail(CODE.NOT_CHECKED_IN);
    if (AttendanceRules.isDayLocked(todayRecord)) return fail(CODE.ALREADY_COMPLETED);
    if (AttendanceRules.isCheckoutBeforeCheckin(todayRecord.checkInTime, now)) {
      return fail(CODE.CHECKOUT_BEFORE_CHECKIN);
    }
    return ok();
  }
});
