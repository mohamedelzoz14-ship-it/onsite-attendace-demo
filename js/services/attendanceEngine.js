/**
 * attendanceEngine.js
 * The Attendance Engine — the ONE place attendance business logic lives:
 * check in, check out, shift validation, off-day validation, working hours,
 * overtime, and missing-checkout detection. UI pages call this engine and
 * render whatever it returns; they never compute attendance rules themselves.
 *
 * Every public method returns { ok: boolean, data, code? } instead of
 * throwing, and never lets an unexpected error escape uncaught — see the
 * try/catch wrapping in checkIn()/checkOut(). Every state-changing action is
 * recorded to the Audit Log via AuditService.
 *
 * Migration note: every method is now `async` (StorageService now talks to
 * Supabase). No business rule, calculation, or return shape changed — every
 * `if` condition and every number computed here is identical to before.
 * The one structural change is detectMissingCheckouts(): it used to mutate
 * every record in a local array and bulk-save the whole thing back, which
 * doesn't map to a real database (rewriting every row to fix a few is
 * wasteful and racy) — it now sends one targeted UPDATE per record that
 * actually needs to change, run concurrently.
 */
import { StorageService } from "./storageService.js";
import { ShiftEngine } from "./shiftEngine.js";
import { ValidationService } from "./validationService.js";
import { AuditService } from "./auditService.js";
import { RequestService } from "./requestService.js";
import { EmployeeService } from "./employeeService.js";
import { ClosureService } from "./closureService.js";
import { USERS } from "../config/users.js";
import { ATTENDANCE_STATUS, NOTIFICATION_CODES as CODE } from "../config/constants.js";
import * as AttendanceRules from "../rules/attendanceRules.js";
import { todayKey } from "../utils/dateUtils.js";

/** @returns {{ok:boolean, data:object|null, code:string|null}} */
function result(ok, data, code) {
  return { ok, data: data || null, code: code || null };
}

export const AttendanceEngine = Object.freeze({
  /** @param {string} employeeId @returns {Promise<object|null>} today's record for this employee, if any. */
  async getTodayRecord(employeeId) {
    return StorageService.findRecord(employeeId, todayKey());
  },

  /**
   * @param {string} employeeId
   * @param {number} [limit=7]
   * @returns {Promise<object[]>} the employee's most recent records, newest first.
   */
  async getHistory(employeeId, limit = 7) {
    const records = await StorageService.getRecords();
    return records
      .filter((r) => r.employeeId === employeeId)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, limit);
  },

  /**
   * Runs every check-in rule (known employee, valid shift, not a day off, not
   * already checked in / already completed) without writing anything.
   * Pages call this before starting the location-verification flow, so we
   * never ask for GPS on a day off or a duplicate check-in.
   * @param {string} employeeId
   * @returns {Promise<{valid:boolean, code?:string}>}
   */
  async validateCheckIn(employeeId) {
    const shift = ShiftEngine.getShiftInfo(employeeId); // unchanged: ShiftEngine is fully synchronous, never touches storage

    const [isActiveEmployee, isStoreClosed, todayRecord, onApprovedLeave] = await Promise.all([
      EmployeeService.isActiveEmployee(employeeId),
      ClosureService.isStoreClosedOn(todayKey()),
      this.getTodayRecord(employeeId),
      RequestService.hasApprovedLeaveFor(employeeId, todayKey())
    ]);

    return ValidationService.validateCheckIn({
      isKnownEmployee: AttendanceRules.isKnownEmployee(employeeId, USERS),
      isActiveEmployee,
      isStoreClosed,
      shift,
      todayRecord,
      onApprovedLeave
    });
  },

  /**
   * Creates today's attendance record. Assumes validateCheckIn() and location
   * verification have already passed — this function re-validates anyway
   * (defense in depth) before writing, and never throws.
   * @param {string} employeeId
   * @param {string} employeeName
   * @param {string} storeId
   * @param {Date} [now]
   * @returns {Promise<{ok:boolean, data:object|null, code:string|null}>}
   */
  async checkIn(employeeId, employeeName, storeId, now = new Date()) {
    try {
      const validation = await this.validateCheckIn(employeeId);
      if (!validation.valid) return result(false, null, validation.code);

      const shiftKey = ShiftEngine.getShiftKeyFor(employeeId, now); // unchanged: synchronous
      const isLate = ShiftEngine.isLate(employeeId, now);           // unchanged: synchronous
      const isEarly = ShiftEngine.isEarly(employeeId, now);         // unchanged: synchronous

      const record = {
        employeeId,
        name: employeeName,
        store: storeId,
        date: todayKey(now),
        shift: shiftKey,
        checkInTime: now.toISOString(),
        checkOutTime: null,
        totalHours: null,
        overtimeHours: 0,
        early: isEarly,
        earlyLeave: false,
        earlyLeaveAuthorized: false,
        status: isLate ? ATTENDANCE_STATUS.LATE : ATTENDANCE_STATUS.PRESENT
      };

      const saved = await StorageService.addRecord(record);
      await AuditService.logCheckIn(employeeId, saved || record);

      const code = isLate ? CODE.CHECK_IN_SUCCESS_LATE : isEarly ? CODE.CHECK_IN_SUCCESS_EARLY : CODE.CHECK_IN_SUCCESS;
      return result(true, saved || record, code);
    } catch (error) {
      await AuditService.logError("attendanceEngine.checkIn", error);
      return result(false, null, CODE.GENERIC_ERROR);
    }
  },

  /**
   * Prevents check-out before check-in and prevents editing an already-locked day.
   * @param {string} employeeId
   * @param {Date} [now]
   * @returns {Promise<{ok:boolean, data:object|null, code:string|null}>}
   */
  async checkOut(employeeId, now = new Date()) {
    try {
      const todayRecord = await this.getTodayRecord(employeeId);
      const validation = ValidationService.validateCheckOut({ todayRecord, now });
      if (!validation.valid) return result(false, todayRecord, validation.code);

      const totalHours = ShiftEngine.computeWorkingHours(todayRecord.checkInTime, now.toISOString()); // unchanged: synchronous
      const overtimeHours = ShiftEngine.computeOvertime(employeeId, new Date(todayRecord.checkInTime), totalHours); // unchanged: synchronous
      const isEarlyLeave = ShiftEngine.isEarlyLeave(employeeId, now); // unchanged: synchronous
      const earlyLeaveAuthorized = isEarlyLeave && (await RequestService.hasApprovedEarlyLeaveFor(employeeId, todayRecord.date));

      const updated = await StorageService.updateRecord(employeeId, todayRecord.date, {
        checkOutTime: now.toISOString(),
        totalHours,
        overtimeHours,
        earlyLeave: isEarlyLeave,
        earlyLeaveAuthorized,
        overtimeConfirmed: overtimeHours > 0 ? false : true
      });
      await AuditService.logCheckOut(employeeId, updated);

      let code = CODE.CHECK_OUT_SUCCESS;
      if (overtimeHours > 0) code = CODE.CHECK_OUT_SUCCESS_OVERTIME;
      else if (isEarlyLeave) code = earlyLeaveAuthorized ? CODE.CHECK_OUT_EARLY_AUTHORIZED : CODE.CHECK_OUT_EARLY_UNAUTHORIZED;

      return result(true, updated, code);
    } catch (error) {
      await AuditService.logError("attendanceEngine.checkOut", error);
      return result(false, null, CODE.GENERIC_ERROR);
    }
  },

  /**
   * Scans every past-day record with no check-out and marks it "missing".
   * Call once per page load (see main.js) — cheap, idempotent, no side effects
   * on days that are already correctly marked.
   * @returns {Promise<boolean>} whether any record was changed.
   */
  async detectMissingCheckouts() {
    try {
      const today = todayKey();
      const records = await StorageService.getRecords();

      const toFix = records.filter(
        (r) => AttendanceRules.isMissingCheckout(r, today) && r.status !== ATTENDANCE_STATUS.MISSING_CHECKOUT
      );
      if (toFix.length === 0) return false;

      await Promise.all(
        toFix.map((r) => StorageService.updateRecord(r.employeeId, r.date, { status: ATTENDANCE_STATUS.MISSING_CHECKOUT }))
      );
      return true;
    } catch (error) {
      await AuditService.logError("attendanceEngine.detectMissingCheckouts", error);
      return false;
    }
  },

  /**
   * A store manager confirms a day's overtime hours are accurate. This is a
   * data confirmation only — it never calculates or changes pay, and it
   * never touches anything outside this app; actual payroll processing
   * stays entirely separate (see README → "Future Backend Plan").
   * @param {string} employeeId
   * @param {string} date - YYYY-MM-DD
   * @param {string} adminId
   * @returns {Promise<{ok:boolean, data:object|null, code:string|null}>}
   */
  async confirmOvertime(employeeId, date, adminId) {
    try {
      const record = await StorageService.findRecord(employeeId, date);
      if (!record) return result(false, null, CODE.RECORD_NOT_FOUND);
      if (!record.overtimeHours || record.overtimeHours <= 0) return result(false, record, CODE.NO_OVERTIME_TO_CONFIRM);
      if (record.overtimeConfirmed) return result(false, record, CODE.OVERTIME_ALREADY_CONFIRMED);

      const updated = await StorageService.updateRecord(employeeId, date, {
        overtimeConfirmed: true,
        overtimeConfirmedBy: adminId,
        overtimeConfirmedAt: new Date().toISOString()
      });
      await AuditService.logOvertimeConfirmed(employeeId, updated, adminId);
      return result(true, updated, CODE.OVERTIME_CONFIRMED);
    } catch (error) {
      await AuditService.logError("attendanceEngine.confirmOvertime", error);
      return result(false, null, CODE.GENERIC_ERROR);
    }
  },

  /**
   * @param {string} employeeId
   * @param {Date} [now]
   * @returns {Promise<{daysWorked:number, daysSoFar:number, lateCount:number}>} this month's summary for the stats cards.
   */
  async getMonthSummary(employeeId, now = new Date()) {
    const monthPrefix = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    const records = await StorageService.getRecords();
    const monthRecords = records.filter((r) => r.employeeId === employeeId && r.date.startsWith(monthPrefix));
    return {
      daysWorked: monthRecords.length,
      daysSoFar: now.getDate(),
      lateCount: monthRecords.filter((r) => r.status === ATTENDANCE_STATUS.LATE).length
    };
  },

  /** @param {string} employeeId @returns {Promise<number>} sum of totalHours over the last 7 days, rounded to 1 decimal. */
  async getWeekHours(employeeId) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const records = await StorageService.getRecords();
    const hours = records
      .filter((r) => r.employeeId === employeeId && r.totalHours && new Date(r.date) >= cutoff)
      .reduce((sum, r) => sum + r.totalHours, 0);
    return Math.round(hours * 10) / 10;
  }
});
