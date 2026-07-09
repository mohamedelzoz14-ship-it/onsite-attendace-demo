/**
 * reportsService.js
 * Aggregation logic for the admin dashboard (KPIs + filtered table rows).
 * adminPage.js only renders what this service returns — it does no counting
 * or filtering of its own, keeping business logic out of the UI layer.
 *
 * The roster is read from EmployeeService (the live source of truth, not a
 * static config array) so a resign/transfer/remove takes effect immediately
 * everywhere KPIs and tables are computed.
 *
 * Migration note: every method is now `async` — no KPI calculation or
 * status-derivation rule changed. One small internal optimization: whether
 * the store is closed today no longer depends on which employee is being
 * checked, so it's fetched ONCE per call and reused, instead of once per
 * employee — this matters more now than it did with localStorage, since
 * each StorageService call is a real network round-trip. The OUTCOME for
 * every employee is identical either way; this only reduces redundant calls.
 */
import { StorageService } from "./storageService.js";
import { ShiftEngine } from "./shiftEngine.js";
import { EmployeeService } from "./employeeService.js";
import { ClosureService } from "./closureService.js";
import * as RequestRules from "../rules/requestRules.js";
import * as EmployeeRules from "../rules/employeeRules.js";
import { HOME_STORE } from "../config/stores.js";
import { ATTENDANCE_STATUS, SHIFT_TYPES } from "../config/constants.js";
import { SHIFT_RULES } from "../config/shiftConfig.js";
import { todayKey } from "../utils/dateUtils.js";

/**
 * A roster employee counts as "not scheduled" today if: they've already
 * left this store (resigned/transferred, see EmployeeService), the store
 * is declared closed today (see ClosureService), it's their personal day
 * off, or they have approved leave for today. A public holiday does NOT
 * exempt anyone here — most retail stays open on holidays, so someone
 * who's scheduled to work today is still expected in, holiday or not.
 * @param {object} emp - the roster employee object (already fetched)
 * @param {string} today - YYYY-MM-DD
 * @param {boolean} storeClosedToday - precomputed once by the caller (same for every employee)
 * @param {object[]} allRequests - all requests, fetched once by the caller
 */
function isScheduledToday(emp, today, storeClosedToday, allRequests) {
  // Same rules as before (active + not closed + not on approved leave + not
  // a day off), applied to data the caller fetched ONCE rather than
  // re-querying Supabase per employee. EmployeeRules.isActiveOn /
  // RequestRules.hasApprovedLeaveFor are the exact functions the async
  // EmployeeService/RequestService wrappers called internally.
  if (!EmployeeRules.isActiveOn(emp, today)) return false;
  if (storeClosedToday) return false;
  if (RequestRules.hasApprovedLeaveFor(allRequests.filter((r) => r.employeeId === emp.id), emp.id, today)) return false;
  return !ShiftEngine.isDayOff(emp.id, new Date());
}

export const ReportsService = Object.freeze({
  /**
   * @returns {Promise<{present:number, late:number, absent:number, missingCheckout:number, scheduledCount:number}>}
   * Today's KPI numbers: present, late, absent (active roster minus today's
   * records, excluding anyone off today for any reason), and the all-time
   * missing-checkout count.
   */
  async getTodayKpis() {
    const today = todayKey();
    const [roster, records, storeClosedToday, allRequests] = await Promise.all([
      EmployeeService.getRoster(),
      StorageService.getRecords(),
      ClosureService.isStoreClosedOn(today),
      StorageService.getRequests()
    ]);
    const todayRecords = records.filter((r) => r.date === today);

    const scheduledCount = roster.filter((emp) => isScheduledToday(emp, today, storeClosedToday, allRequests)).length;

    return {
      present: todayRecords.filter((r) => r.status === ATTENDANCE_STATUS.PRESENT).length,
      late: todayRecords.filter((r) => r.status === ATTENDANCE_STATUS.LATE).length,
      absent: Math.max(scheduledCount - todayRecords.length, 0),
      missingCheckout: records.filter((r) => r.status === ATTENDANCE_STATUS.MISSING_CHECKOUT).length,
      scheduledCount
    };
  },

  /**
   * Builds the admin table rows for the given filters.
   * @param {{date:"today"|"all", employeeId:string, status:string}} filters
   * @returns {Promise<object[]>} When `filters.date === "today"`, one row is synthesized
   * per ACTIVE roster employee (including absent/day-off/on-leave) so the
   * table always shows today's store, not just whoever has already punched in —
   * employees who've resigned/transferred out simply don't appear for "today"
   * (their historical records still show under the "all" date filter).
   */
  async getFilteredRows(filters) {
    const today = todayKey();
    const records = await StorageService.getRecords();
    let rows;

    if (filters.date === "today") {
      const todayRecords = records.filter((r) => r.date === today);
      const [activeRoster, storeClosedToday, allRequests] = await Promise.all([
        EmployeeService.getActiveRoster(),
        ClosureService.isStoreClosedOn(today),
        StorageService.getRequests()
      ]);

      rows = activeRoster.map((emp) => {
        const existing = todayRecords.find((r) => r.employeeId === emp.id);
        if (existing) return existing;

        const shiftKey = ShiftEngine.getShiftKeyFor(emp.id, new Date());
        let status = ATTENDANCE_STATUS.ABSENT;
        // Same RequestRules check, against requests fetched once above.
        if (RequestRules.hasApprovedLeaveFor(allRequests.filter((r) => r.employeeId === emp.id), emp.id, today)) status = ATTENDANCE_STATUS.ON_LEAVE;
        else if (storeClosedToday) status = ATTENDANCE_STATUS.STORE_CLOSED;
        else if (shiftKey === SHIFT_TYPES.OFF) status = ATTENDANCE_STATUS.DAY_OFF;

        return {
          employeeId: emp.id,
          name: emp.name,
          store: emp.store || HOME_STORE.id,
          date: today,
          shift: shiftKey,
          checkInTime: null,
          checkOutTime: null,
          totalHours: null,
          status
        };
      });
    } else {
      rows = records.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    }

    if (filters.employeeId && filters.employeeId !== "all") {
      rows = rows.filter((r) => r.employeeId === filters.employeeId);
    }
    if (filters.status && filters.status !== "all") {
      rows = rows.filter((r) => r.status === filters.status);
    }
    // filters.store is intentionally a no-op today (single-store pilot) — the
    // shape is kept so multi-store data can be filtered without touching adminPage.js.

    return rows;
  },

  /**
   * @returns {Promise<object[]>} every record with overtime hours the store manager
   * hasn't confirmed yet, most recent first. This is a data-accuracy check,
   * not a payroll calculation — see docs/BUSINESS_RULES.md → "Overtime confirmation".
   */
  async getUnconfirmedOvertime() {
    const records = await StorageService.getRecords();
    return records.filter((r) => r.overtimeHours > 0 && !r.overtimeConfirmed).sort((a, b) => (a.date < b.date ? 1 : -1));
  },

  /**
   * @param {number} [thresholdCount] - defaults to SHIFT_RULES.latenessAlertThreshold
   * @returns {Promise<{employeeId:string, name:string, count:number, dates:string[]}[]>}
   * Employees with at least `thresholdCount` late arrivals in the current
   * calendar month, most-late-first. Purely informational — no action is
   * taken automatically; it's a heads-up for the manager to follow up on.
   */
  async getLatenessPatterns(thresholdCount = SHIFT_RULES.latenessAlertThreshold) {
    const monthPrefix = todayKey().slice(0, 7); // "YYYY-MM"
    const byEmployee = new Map();

    const records = await StorageService.getRecords();
    records
      .filter((r) => r.status === ATTENDANCE_STATUS.LATE && r.date.startsWith(monthPrefix))
      .forEach((r) => {
        if (!byEmployee.has(r.employeeId)) {
          byEmployee.set(r.employeeId, { employeeId: r.employeeId, name: r.name, count: 0, dates: [] });
        }
        const entry = byEmployee.get(r.employeeId);
        entry.count += 1;
        entry.dates.push(r.date);
      });

    return Array.from(byEmployee.values())
      .filter((e) => e.count >= thresholdCount)
      .sort((a, b) => b.count - a.count);
  }
});
