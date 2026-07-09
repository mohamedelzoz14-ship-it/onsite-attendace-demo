/**
 * dmReportsService.js
 * Aggregation logic for the District Manager dashboard: org-wide KPI cards,
 * a per-store breakdown, 30-day trend series for the charts, and the
 * filterable live employee table.
 *
 * This is a NEW, separate service — it does not modify attendanceEngine.js,
 * shiftEngine.js, or reportsService.js. Where the existing ReportsService
 * already computes something correctly (today's KPIs, today's/all rows), this
 * service calls it and layers DM-specific concerns (store/shift filtering,
 * historical trends, per-store grouping) on top, rather than duplicating or
 * changing that logic.
 *
 * Current data scope, stated honestly: this pilot only has one real staffed
 * roster (HOME_STORE / EG222). Other configured stores (config/stores.js)
 * will show 0 employees until they have their own roster entries — the
 * per-store breakdown is correct today AND ready to scale once more stores
 * are staffed, without any code changes here.
 *
 * Migration note: every method is now `async` — no calculation changed.
 * getDailyTrend()'s 30-day loop used to run sequentially, which was fine
 * when every check was a synchronous localStorage read; now that each
 * check is a real network call, it's restructured to compute all 30 days
 * concurrently via Promise.all (same per-day math, same final numbers —
 * only the "one day at a time" vs "all at once" scheduling changed).
 */
import { StorageService } from "./storageService.js";
import { ShiftEngine } from "./shiftEngine.js";
import { EmployeeService } from "./employeeService.js";
import { ClosureService } from "./closureService.js";
import { ReportsService } from "./reportsService.js";
import * as RequestRules from "../rules/requestRules.js";
import * as EmployeeRules from "../rules/employeeRules.js";
import * as ClosureRules from "../rules/closureRules.js";
import { STORES, HOME_STORE } from "../config/stores.js";
import { ATTENDANCE_STATUS } from "../config/constants.js";
import { todayKey } from "../utils/dateUtils.js";

export const DMReportsService = Object.freeze({
  /**
   * @returns {Promise<{totalEmployees:number, present:number, late:number, absent:number, off:number, onLeave:number}>}
   * The six org-wide cards. `present`/`late`/`absent` reuse ReportsService's
   * already-correct today math; `off` and `onLeave` are computed here since
   * the store-manager dashboard only needed their combined exclusion, not
   * the individual counts.
   */
  async getOverviewCards() {
    const today = todayKey();
    const [roster, activeRoster, base, allRequests] = await Promise.all([
      EmployeeService.getRoster(),
      EmployeeService.getActiveRoster(),
      ReportsService.getTodayKpis(),
      StorageService.getRequests()
    ]);

    let offCount = 0;
    let onLeaveCount = 0;
    for (const emp of activeRoster) {
      // Same RequestRules check, against requests fetched once above rather
      // than a Supabase round-trip per active employee.
      if (RequestRules.hasApprovedLeaveFor(allRequests.filter((r) => r.employeeId === emp.id), emp.id, today)) onLeaveCount += 1;
      else if (ShiftEngine.isDayOff(emp.id, new Date())) offCount += 1;
    }

    return {
      totalEmployees: roster.length,
      present: base.present,
      late: base.late,
      absent: base.absent,
      off: offCount,
      onLeave: onLeaveCount
    };
  },

  /**
   * @param {number} [days] - defaults to 30
   * @returns {Promise<{labels:string[], present:number[], late:number[], attendancePct:number[]}>}
   * Daily series for the three charts. `attendancePct` is (present+late) /
   * scheduledThatDay * 100 — scheduling is evaluated against the CURRENT
   * roster/schedule for each historical day (a reasonable approximation;
   * this pilot doesn't retroactively reconstruct who was on the roster on
   * a past date). Real data will be sparse until the app has been in use
   * for a while — this is expected for a fresh pilot, not a bug.
   */
  async getDailyTrend(days = 30) {
    // PERFORMANCE FIX (behavior identical): this used to call
    // isActiveEmployee / hasApprovedLeaveFor / isStoreClosedOn INSIDE a
    // days x roster nested loop — each of which re-fetched an entire table
    // from Supabase every time. At the pilot's 5 employees x 30 days that
    // was ~900 network calls (slow but survivable); at the real 49
    // employees x 180 days (monthly view) it was ~8,800 near-simultaneous
    // calls, which exhausted the browser's connection pool
    // (ERR_INSUFFICIENT_RESOURCES) and broke the whole dashboard.
    //
    // Now every table is fetched EXACTLY ONCE, and the same rule functions
    // (RequestRules.hasApprovedLeaveFor, EmployeeRules.isActiveOn,
    // ClosureRules.findClosure) are applied in memory — so the numbers
    // produced are byte-for-byte the same, only the data access changed.
    const [records, roster, allRequests, allClosures] = await Promise.all([
      StorageService.getRecords(),
      EmployeeService.getRoster(),
      StorageService.getRequests(),
      StorageService.getClosures()
    ]);

    const dayList = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dayList.push({ date: d, key: todayKey(d) });
    }

    const perDay = dayList.map(({ date: d, key }) => {
      const dayRecords = records.filter((r) => r.date === key);
      const presentCount = dayRecords.filter((r) => r.status === ATTENDANCE_STATUS.PRESENT).length;
      const lateCount = dayRecords.filter((r) => r.status === ATTENDANCE_STATUS.LATE).length;

      const storeClosedThatDay = !!ClosureRules.findClosure(key, allClosures);
      let scheduledCount = 0;
      for (const emp of roster) {
        if (!EmployeeRules.isActiveOn(emp, key)) continue;
        if (storeClosedThatDay) continue;
        if (RequestRules.hasApprovedLeaveFor(allRequests.filter((r) => r.employeeId === emp.id), emp.id, key)) continue;
        if (ShiftEngine.isDayOff(emp.id, d)) continue;
        scheduledCount += 1;
      }

      return {
        key,
        presentCount,
        lateCount,
        attendancePct: scheduledCount > 0 ? Math.round(((presentCount + lateCount) / scheduledCount) * 100) : 0
      };
    });

    return {
      labels: perDay.map((d) => d.key),
      present: perDay.map((d) => d.presentCount),
      late: perDay.map((d) => d.lateCount),
      attendancePct: perDay.map((d) => d.attendancePct)
    };
  },

  /**
   * @returns {Promise<{storeId:string, storeLabel:string, present:number, late:number, absent:number, off:number, employeeCount:number}[]>}
   * One row per configured store (config/stores.js). `present`/`late` are
   * counted from TODAY's actual records grouped by which store they
   * happened at (this already works correctly for a covering employee —
   * see docs/BUSINESS_RULES.md → "Multi-store check-in"). `absent`/`off`/
   * `employeeCount` are only meaningful for a store that has a roster —
   * currently just HOME_STORE — other configured stores show 0 for those
   * until they have their own staff.
   */
  async getStoresOverview() {
    const today = todayKey();
    const [allRecords, roster, activeRoster, storeClosedToday, allRequests] = await Promise.all([
      StorageService.getRecords(),
      EmployeeService.getRoster(),
      EmployeeService.getActiveRoster(),
      ClosureService.isStoreClosedOn(today),
      StorageService.getRequests()
    ]);
    const todayRecords = allRecords.filter((r) => r.date === today);

    return STORES.map((store) => {
      const storeRecords = todayRecords.filter((r) => r.store === store.id);
      const present = storeRecords.filter((r) => r.status === ATTENDANCE_STATUS.PRESENT).length;
      const late = storeRecords.filter((r) => r.status === ATTENDANCE_STATUS.LATE).length;

      const isStaffedHere = store.id === HOME_STORE.id;
      let absent = 0;
      let off = 0;
      if (isStaffedHere) {
        for (const emp of activeRoster) {
          const hasRecordToday = todayRecords.some((r) => r.employeeId === emp.id);
          // Same RequestRules check as before, but against the requests
          // fetched once above rather than a Supabase round-trip per employee.
          if (RequestRules.hasApprovedLeaveFor(allRequests.filter((r) => r.employeeId === emp.id), emp.id, today)) continue;
          if (storeClosedToday) continue;
          if (ShiftEngine.isDayOff(emp.id, new Date())) {
            off += 1;
            continue;
          }
          if (!hasRecordToday) absent += 1;
        }
      }

      return {
        storeId: store.id,
        storeLabel: store.label,
        present,
        late,
        absent,
        off,
        employeeCount: isStaffedHere ? roster.length : 0
      };
    });
  },

  /**
   * The live, filterable employee table. Reuses ReportsService.getFilteredRows()
   * for the base data (today's synthesized roster view, or full history) and
   * layers store/shift/search filtering on top — reportsService.js itself is
   * untouched.
   * @param {{date?:string, storeId?:string, employeeId?:string, shift?:string, search?:string}} filters
   * @returns {Promise<object[]>}
   */
  async getEmployeeTableRows(filters = {}) {
    const targetDate = filters.date || todayKey();
    const isToday = targetDate === todayKey();

    let rows = await ReportsService.getFilteredRows({ date: isToday ? "today" : "all", employeeId: "all", status: "all" });
    if (!isToday) rows = rows.filter((r) => r.date === targetDate);

    if (filters.storeId && filters.storeId !== "all") {
      rows = rows.filter((r) => r.store === filters.storeId);
    }
    if (filters.employeeId && filters.employeeId !== "all") {
      rows = rows.filter((r) => r.employeeId === filters.employeeId);
    }
    if (filters.shift && filters.shift !== "all") {
      rows = rows.filter((r) => r.shift === filters.shift);
    }
    if (filters.search) {
      const q = filters.search.trim().toLowerCase();
      rows = rows.filter((r) => r.employeeId.toLowerCase().includes(q) || (r.name || "").toLowerCase().includes(q));
    }

    return rows;
  }
});
