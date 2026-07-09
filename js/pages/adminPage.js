/**
 * adminPage.js
 * Wires the admin dashboard: KPIs/filters/table, the Pending Requests panel,
 * and the Employees management section. All business logic lives in the
 * services (reportsService, requestService, employeeService) — this file
 * only reads clicks/filter values and renders whatever those services return.
 *
 * Migration note: every render function and handler is now `async` (the
 * services they call now talk to Supabase). No UI behavior, calculation, or
 * message changed. renderAll()'s six independent panel renders now run
 * concurrently (Promise.all) instead of one after another, since each
 * writes to a different DOM element and there's no ordering dependency
 * between them — this is purely a speed improvement given each render now
 * involves real network calls, not a behavior change.
 */
import { ReportsService } from "../services/reportsService.js";
import { RequestService } from "../services/requestService.js";
import { EmployeeService } from "../services/employeeService.js";
import { AttendanceEngine } from "../services/attendanceEngine.js";
import { ClosureService } from "../services/closureService.js";
import { ShiftEngine } from "../services/shiftEngine.js";
import { NotificationService } from "../services/notificationService.js";
import { AuditService } from "../services/auditService.js";
import { SHIFTS, WEEKLY_SCHEDULE } from "../config/shiftConfig.js";
import { HOME_STORE, getStoreById, STORES } from "../config/stores.js";
import { NOTIFICATION_CODES as CODE, NOTIFICATION_TYPES as TYPE, REQUEST_TYPES, REQUEST_TYPE_LABELS } from "../config/constants.js";
import { formatTime, formatShortDate, todayKey } from "../utils/dateUtils.js";
import { pillHtml } from "../components/badge.js";
import { renderTable } from "../components/table.js";
import { renderKpiCards } from "../components/card.js";
import { renderWelcomeHeader, renderTodaysValue } from "../components/header.js";
import { openAddEmployeeDialog, openEmployeeStatusDialog } from "../components/employeeDialogs.js";
import { openClosureDialog } from "../components/closureDialog.js";
import { confirmDialog } from "../components/dialog.js";
import { renderActivityFeed } from "../components/activityFeed.js";
import { maybeShowOnboarding } from "../components/onboarding.js";
import { byId, on, qsa, escapeHtml } from "../utils/domUtils.js";

/** Maps a NotificationService severity to the admin note's CSS state classes (shared with employeePage's location-note). */
function bannerStateFor(type) {
  if (type === TYPE.SUCCESS) return "ok";
  if (type === TYPE.ERROR || type === TYPE.WARNING) return "error";
  return "checking";
}

/** Renders the employment-status pill for the Employees table — distinct from the per-day attendance status pills. */
function employeeStatusPillHtml(emp) {
  if (emp.startDate && emp.startDate > todayKey()) {
    return `<span class="pill leave"><span class="dot"></span>Starts ${formatShortDate(emp.startDate)}</span>`;
  }
  if (!emp.endDate) return `<span class="pill present"><span class="dot"></span>Active</span>`;
  if (emp.endReason === "transferred") {
    return `<span class="pill leave"><span class="dot"></span>Transferred to ${escapeHtml(emp.transferredTo || "another store")} · ${formatShortDate(emp.endDate)}</span>`;
  }
  return `<span class="pill absent"><span class="dot"></span>Resigned · ${formatShortDate(emp.endDate)}</span>`;
}

/** A small inline flag next to the status pill when a record includes an early departure. */
function earlyLeaveTagHtml(r) {
  if (!r.earlyLeave) return "";
  const color = r.earlyLeaveAuthorized ? "var(--gray-500)" : "var(--amber)";
  const label = r.earlyLeaveAuthorized ? "Left early (approved)" : "Left early (unauthorized)";
  return ` <span style="font-size:11px; font-weight:600; color:${color};">· ${label}</span>`;
}

export function initAdminPage() {
  const filters = {
    store: byId("filterStore"),
    date: byId("filterDate"),
    employee: byId("filterEmployee"),
    status: byId("filterStatus")
  };

  const adminNoteEl = byId("adminRequestNote");
  const adminNoteTextEl = byId("adminRequestNoteText");
  let noteHideTimer = null;

  /** Shows a transient success/error banner above the pending-requests table, auto-hiding after a few seconds. */
  function flashNote(code) {
    const { type, message } = NotificationService.get(code);
    adminNoteEl.className = "location-note " + bannerStateFor(type);
    adminNoteEl.style.display = "flex";
    adminNoteTextEl.textContent = message;
    clearTimeout(noteHideTimer);
    noteHideTimer = setTimeout(() => { adminNoteEl.style.display = "none"; }, 4000);
  }

  const employeesNoteEl = byId("employeesNote");
  const employeesNoteTextEl = byId("employeesNoteText");
  let employeesNoteHideTimer = null;

  /** Same pattern as flashNote(), for the Employees section (separate element so the two sections don't fight over one banner). */
  function flashEmployeesNote(code) {
    const { type, message } = NotificationService.get(code);
    employeesNoteEl.className = "location-note " + bannerStateFor(type);
    employeesNoteEl.style.display = "flex";
    employeesNoteTextEl.textContent = message;
    clearTimeout(employeesNoteHideTimer);
    employeesNoteHideTimer = setTimeout(() => { employeesNoteEl.style.display = "none"; }, 4000);
  }

  let adminId = null;

  /** Rebuilds the employee filter dropdown from the live roster — called on mount and after any roster change. */
  async function populateEmployeeFilter() {
    const currentValue = filters.employee.value;
    filters.employee.innerHTML = '<option value="all">All employees</option>';
    const roster = await EmployeeService.getRoster();
    roster.forEach((emp) => {
      const opt = document.createElement("option");
      opt.value = emp.id;
      opt.textContent = emp.endDate ? `${emp.name} (${emp.endReason})` : emp.name;
      filters.employee.appendChild(opt);
    });
    // Preserve the admin's current filter selection if that employee still exists.
    if ([...filters.employee.options].some((o) => o.value === currentValue)) {
      filters.employee.value = currentValue;
    }
  }

  /** Renders the type-specific "Details" cell for a pending request. */
  function describeRequest(r) {
    if (r.type === REQUEST_TYPES.MISSED_CHECKOUT_CORRECTION) {
      return `Check-out: <strong>${formatTime(r.payload.proposedCheckOutTime)}</strong>`;
    }
    if (r.type === REQUEST_TYPES.PLANNED_LEAVE) {
      return "Full day off requested";
    }
    if (r.type === REQUEST_TYPES.SICK_LEAVE) {
      return "Sick day reported";
    }
    if (r.type === REQUEST_TYPES.EARLY_LEAVE) {
      return r.payload.expectedTime ? `Leaving around <strong>${r.payload.expectedTime}</strong>` : "Leaving early — no time given";
    }
    return "—";
  }

  async function renderPendingRequests() {
    try {
      const pending = await RequestService.getPendingRequests();
      byId("pendingRequestsCount").textContent = `${pending.length} pending`;

      renderTable(
        byId("pendingRequestsBody"),
        pending,
        (r) => `<tr>
          <td class="strong">${escapeHtml(r.employeeName)}</td>
          <td>${REQUEST_TYPE_LABELS[r.type] || r.type}</td>
          <td>${formatShortDate(r.targetDate)}</td>
          <td>${describeRequest(r)}</td>
          <td class="reason-cell">${escapeHtml(r.reason) || "—"}</td>
          <td>${formatShortDate(r.requestedAt.slice(0, 10))}</td>
          <td>
            <button class="btn-mini approve" data-approve="${r.id}">Approve</button>
            <button class="btn-mini reject" data-reject="${r.id}">Reject</button>
          </td>
        </tr>`,
        7,
        NotificationService.get(CODE.NO_PENDING_REQUESTS).message
      );
    } catch (error) {
      await AuditService.logError("adminPage.renderPendingRequests", error);
    }
  }

  async function renderOvertimePanel() {
    try {
      const unconfirmed = await ReportsService.getUnconfirmedOvertime();
      byId("overtimeCount").textContent = `${unconfirmed.length} to review`;

      renderTable(
        byId("overtimeTableBody"),
        unconfirmed,
        (r) => `<tr>
          <td class="strong">${escapeHtml(r.name)}</td>
          <td>${formatShortDate(r.date)}</td>
          <td>${r.overtimeHours} hrs</td>
          <td>${r.totalHours} hrs</td>
          <td><button class="btn-mini approve" data-confirm-overtime="${r.employeeId}" data-confirm-date="${r.date}">Confirm</button></td>
        </tr>`,
        5,
        "No overtime waiting on confirmation."
      );
    } catch (error) {
      await AuditService.logError("adminPage.renderOvertimePanel", error);
    }
  }

  async function renderLatenessPanel() {
    try {
      const patterns = await ReportsService.getLatenessPatterns();
      byId("latenessCount").textContent = `${patterns.length} flagged`;

      renderTable(
        byId("latenessTableBody"),
        patterns,
        (p) => `<tr>
          <td class="strong">${escapeHtml(p.name)}</td>
          <td>${p.count}</td>
          <td class="reason-cell">${p.dates.map(formatShortDate).join(", ")}</td>
        </tr>`,
        3,
        "No repeated lateness this month."
      );
    } catch (error) {
      await AuditService.logError("adminPage.renderLatenessPanel", error);
    }
  }

  async function renderClosuresPanel() {
    try {
      const closures = await ClosureService.getClosures();

      renderTable(
        byId("closuresTableBody"),
        closures,
        (c) => `<tr>
          <td class="strong">${formatShortDate(c.date)}</td>
          <td class="reason-cell">${escapeHtml(c.reason) || "—"}</td>
          <td>${formatShortDate(c.addedAt.slice(0, 10))}</td>
          <td><button class="link-btn" data-remove-closure="${c.date}">Remove</button></td>
        </tr>`,
        4,
        "No closures recorded."
      );
    } catch (error) {
      await AuditService.logError("adminPage.renderClosuresPanel", error);
    }
  }

  /** A faster-to-scan view of the SAME today's-attendance data render() already
   * fetches below — always shows today specifically, regardless of whatever
   * date the admin has the main table filtered to. */
  const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  /** Every data point here comes from an EXISTING, unmodified service method
   * — the same ones employeePage.js already calls for the logged-in
   * employee's own dashboard, just called here with a different employeeId.
   * No new business logic, no new Supabase query shape. */
  async function openEmployeeProfile(employeeId) {
    try {
      const roster = await EmployeeService.getRoster();
      const emp = roster.find((e) => e.id === employeeId);
      if (!emp) return;

      const [monthSummary, weekHours, history, requests] = await Promise.all([
        AttendanceEngine.getMonthSummary(employeeId),
        AttendanceEngine.getWeekHours(employeeId),
        AttendanceEngine.getHistory(employeeId, 7),
        RequestService.getRequestsForEmployee(employeeId)
      ]);

      const initials = emp.name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();

      const schedule = WEEKLY_SCHEDULE[emp.id] || [];
      const scheduleHtml = DAY_LABELS.map((day, i) => {
        const key = schedule[i];
        const label = key ? SHIFTS[key].label : "—";
        const isOff = key === "off";
        return `<div class="profile-schedule-row"><span class="day">${day}</span><span class="shift${isOff ? " off" : ""}">${label}</span></div>`;
      }).join("");

      const historyHtml = history.length
        ? history
            .slice(0, 5)
            .map(
              (r) => `<div class="profile-mini-row">
                <span>${formatShortDate(r.date)}</span>
                <span>${formatTime(r.checkInTime)} – ${formatTime(r.checkOutTime)}</span>
                ${pillHtml(r.status)}
              </div>`
            )
            .join("")
        : `<div class="profile-mini-row" style="color:var(--gray-500);">No attendance recorded yet.</div>`;

      const requestsHtml = requests.length
        ? requests
            .slice(0, 5)
            .map((r) => {
              const statusPillClass = { pending: "leave", approved: "present", rejected: "absent" };
              return `<div class="profile-mini-row">
                <span>${REQUEST_TYPE_LABELS[r.type] || r.type}</span>
                <span>${formatShortDate(r.targetDate)}</span>
                <span class="pill ${statusPillClass[r.status] || "leave"}"><span class="dot"></span>${r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span>
              </div>`;
            })
            .join("")
        : `<div class="profile-mini-row" style="color:var(--gray-500);">No requests submitted yet.</div>`;

      byId("employeeProfileContent").innerHTML = `
        <div class="profile-header">
          <div class="profile-avatar">${initials}</div>
          <div class="profile-name">${escapeHtml(emp.name)}</div>
          <div class="profile-role">Sales Associate · ${HOME_STORE.label}</div>
          <div style="margin-top:10px;">${employeeStatusPillHtml(emp)}</div>
        </div>

        <div class="profile-section">
          <div class="profile-section-title">Employee details</div>
          <div class="profile-field-grid">
            <div class="profile-field"><div class="k">Employee ID</div><div class="v">${emp.id}</div></div>
            <div class="profile-field"><div class="k">Store</div><div class="v">${HOME_STORE.label}</div></div>
            <div class="profile-field"><div class="k">Role</div><div class="v">Sales Associate</div></div>
            <div class="profile-field"><div class="k">Join date</div><div class="v">${emp.startDate ? formatShortDate(emp.startDate) : "—"}</div></div>
          </div>
        </div>

        <div class="profile-section">
          <div class="profile-section-title">Weekly schedule</div>
          ${scheduleHtml}
        </div>

        <div class="profile-section">
          <div class="profile-section-title">Attendance summary</div>
          <div class="profile-stat-row">
            <div class="profile-stat"><div class="figure">${monthSummary.daysWorked}/${monthSummary.daysSoFar}</div><div class="label">Days this month</div></div>
            <div class="profile-stat"><div class="figure">${weekHours} hrs</div><div class="label">Hours this week</div></div>
            <div class="profile-stat"><div class="figure">${monthSummary.lateCount}</div><div class="label">Late this month</div></div>
          </div>
        </div>

        <div class="profile-section">
          <div class="profile-section-title">Recent attendance</div>
          ${historyHtml}
        </div>

        <div class="profile-section">
          <div class="profile-section-title">Recent requests</div>
          ${requestsHtml}
        </div>
      `;

      byId("employeeProfileOverlay").classList.add("open");
    } catch (error) {
      await AuditService.logError("adminPage.openEmployeeProfile", error);
    }
  }

  function closeEmployeeProfile() {
    byId("employeeProfileOverlay").classList.remove("open");
  }

  async function renderTeamStatus() {
    try {
      const rows = await ReportsService.getFilteredRows({ date: "today", employeeId: "all", status: "all" });
      byId("teamStatusCount").textContent = `${rows.length} on the roster today`;

      const dotClassByStatus = { present: "present", late: "late", absent: "absent" };
      const grid = byId("teamStatusGrid");
      if (rows.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="padding:20px;"><div class="empty-title">No one on the roster today</div></div>`;
        return;
      }
      grid.innerHTML = rows
        .map((r) => {
          const initials = r.name
            .split(" ")
            .map((p) => p[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();
          const dotClass = dotClassByStatus[r.status] || "leave";
          return `<div class="team-status-chip">
            <span class="avatar">${initials}</span>
            <span class="name">${escapeHtml(r.name)}</span>
            <span class="status-dot ${dotClass}"></span>
          </div>`;
        })
        .join("");
    } catch (error) {
      await AuditService.logError("adminPage.renderTeamStatus", error);
    }
  }

  /** Formats the EXISTING audit log (AuditService.getLog()) into readable
   * sentences — the events themselves are already recorded elsewhere by the
   * real business logic; this only presents them differently. */
  async function renderActivityFeedPanel() {
    try {
      const [events, roster] = await Promise.all([AuditService.getLog(), EmployeeService.getRoster()]);
      byId("adminActivityFeed").innerHTML = renderActivityFeed(events, roster);
    } catch (error) {
      await AuditService.logError("adminPage.renderActivityFeedPanel", error);
    }
  }

  async function render() {
    try {
      const kpis = await ReportsService.getTodayKpis();
      renderKpiCards(kpis);

      const rows = await ReportsService.getFilteredRows({
        date: filters.date.value,
        employeeId: filters.employee.value,
        status: filters.status.value
      });

      renderTable(
        byId("adminTableBody"),
        rows,
        (r) => {
          const dateCell = filters.date.value === "today" ? "Today" : formatShortDate(r.date);
          const shiftLabel = r.shift ? SHIFTS[r.shift].label : "—";
          const store = getStoreById(r.store);
          const isAway = r.store && r.store !== HOME_STORE.id;
          const storeCell = isAway
            ? `<span class="store-cell" title="Covering — not their home store" style="color:var(--amber); font-weight:600;">🔄 ${store ? store.label : r.store}</span>`
            : `<span class="store-cell"><span class="store-dot"></span>${r.store}</span>`;
          return `<tr><td class="strong">${r.name}</td>
            <td>${storeCell}</td>
            <td>${shiftLabel}</td>
            <td>${dateCell}</td>
            <td>${formatTime(r.checkInTime)}</td>
            <td>${formatTime(r.checkOutTime)}</td>
            <td>${pillHtml(r.status)}${earlyLeaveTagHtml(r)}</td></tr>`;
        },
        7,
        NotificationService.get(CODE.NO_RECORDS_ADMIN).message,
        "No matches"
      );
    } catch (error) {
      await AuditService.logError("adminPage.render", error);
      renderTable(byId("adminTableBody"), [], () => "", 7, NotificationService.get(CODE.GENERIC_ERROR).message);
    }
  }

  /** @param {object} emp @param {string} query @returns {boolean} */
  function matchesDirectorySearch(emp, query) {
    if (!query || !query.trim()) return true;
    const q = query.trim().toLowerCase();
    return emp.id.toLowerCase().includes(q) || emp.name.toLowerCase().includes(q);
  }

  /** Mirrors the same "active today" rule already used everywhere else
   * (an employee with no end date, or one whose end date hasn't happened
   * yet, is active) — reimplemented as a plain sync check here since the
   * roster rows are already in hand, not a new business rule. */
  function isEmployeeActiveForFilter(emp) {
    return !emp.endDate || emp.endDate > todayKey();
  }

  /** Populates the Store/Role filters once. Store is forward-compatible with
   * config/stores.js's full store list even though only HOME_STORE has any
   * roster today. Role has exactly one real value in this data model right
   * now (there's no job-title field on an employee row) — shown honestly as
   * the one option that exists, rather than inventing fake variety. */
  function populateDirectoryFilters() {
    const storeSelect = byId("dirFilterStore");
    if (storeSelect.options.length === 1) {
      STORES.forEach((store) => {
        const opt = document.createElement("option");
        opt.value = store.id;
        opt.textContent = store.label;
        storeSelect.appendChild(opt);
      });
    }
    const roleSelect = byId("dirFilterRole");
    if (roleSelect.options.length === 1) {
      const opt = document.createElement("option");
      opt.value = "Sales Associate";
      opt.textContent = "Sales Associate";
      roleSelect.appendChild(opt);
    }
  }

  async function renderEmployeesSection() {
    try {
      const roster = await EmployeeService.getRoster();
      populateDirectoryFilters();

      const searchQuery = byId("dirSearchInput").value;
      const storeFilter = byId("dirFilterStore").value;
      const roleFilter = byId("dirFilterRole").value;
      const statusFilter = byId("dirFilterStatus").value;
      const sortBy = byId("dirSortBy").value;

      let rows = roster.filter((emp) => matchesDirectorySearch(emp, searchQuery));
      // Every current roster row is at HOME_STORE and is a Sales Associate —
      // selecting any OTHER store/role correctly shows no matches rather than
      // silently ignoring the filter, since that's the honest answer today.
      if (storeFilter !== "all" && storeFilter !== HOME_STORE.id) rows = [];
      if (roleFilter !== "all" && roleFilter !== "Sales Associate") rows = [];
      if (statusFilter === "active") rows = rows.filter(isEmployeeActiveForFilter);
      if (statusFilter === "inactive") rows = rows.filter((emp) => !isEmployeeActiveForFilter(emp));

      // "Sort by store" and "Sort by name" produce the same order today,
      // since every current roster row shares one store — the comparator
      // below genuinely checks store first, it just has nothing to
      // differentiate on yet. Ready to actually sort by store once the
      // roster has more than one.
      rows = rows.slice().sort((a, b) => {
        if (sortBy === "store") {
          const storeCompare = HOME_STORE.label.localeCompare(HOME_STORE.label);
          if (storeCompare !== 0) return storeCompare;
        }
        return a.name.localeCompare(b.name);
      });

      renderTable(
        byId("employeesTableBody"),
        rows,
        (emp) => `<tr data-employee-row="${emp.id}">
          <td class="strong">${escapeHtml(emp.name)}</td>
          <td>${emp.id}</td>
          <td>${HOME_STORE.label}</td>
          <td>Sales Associate</td>
          <td>${employeeStatusPillHtml(emp)}</td>
          <td>
            ${emp.endDate
              ? `<button class="btn-mini approve" data-reactivate="${emp.id}">Reactivate</button>`
              : `<button class="btn-mini reject" data-mark-left="${emp.id}">Mark left</button>`}
            <button class="link-btn" data-remove="${emp.id}">Remove</button>
          </td>
        </tr>`,
        6,
        "No employees match these filters.",
        "No matches"
      );
    } catch (error) {
      await AuditService.logError("adminPage.renderEmployeesSection", error);
    }
  }

  async function renderAll() {
    // Independent panels, each writing to its own DOM element — run concurrently.
    await Promise.all([
      renderPendingRequests(),
      renderOvertimePanel(),
      renderLatenessPanel(),
      renderClosuresPanel(),
      render(),
      renderEmployeesSection(),
      renderTeamStatus(),
      renderActivityFeedPanel()
    ]);
  }

  // ---- Pending requests: approve / reject ----

  async function handleApprove(requestId) {
    try {
      const result = await RequestService.approveRequest(requestId, adminId);
      flashNote(result.code);
      if (result.ok) await renderAll(); // KPIs/table change too: the record just left "missing"
    } catch (error) {
      await AuditService.logError("adminPage.handleApprove", error);
      flashNote(CODE.GENERIC_ERROR);
    }
  }

  async function handleReject(requestId) {
    try {
      const result = await RequestService.rejectRequest(requestId, adminId);
      flashNote(result.code);
      if (result.ok) await renderPendingRequests();
    } catch (error) {
      await AuditService.logError("adminPage.handleReject", error);
      flashNote(CODE.GENERIC_ERROR);
    }
  }

  on(byId("pendingRequestsBody"), "click", (e) => {
    const approveBtn = e.target.closest("[data-approve]");
    const rejectBtn = e.target.closest("[data-reject]");
    if (approveBtn) handleApprove(approveBtn.dataset.approve);
    else if (rejectBtn) handleReject(rejectBtn.dataset.reject);
  });

  async function handleConfirmOvertime(employeeId, date) {
    try {
      const res = await AttendanceEngine.confirmOvertime(employeeId, date, adminId);
      flashNote(res.code);
      if (res.ok) await renderOvertimePanel();
    } catch (error) {
      await AuditService.logError("adminPage.handleConfirmOvertime", error);
      flashNote(CODE.GENERIC_ERROR);
    }
  }

  on(byId("overtimeTableBody"), "click", (e) => {
    const btn = e.target.closest("[data-confirm-overtime]");
    if (btn) handleConfirmOvertime(btn.dataset.confirmOvertime, btn.dataset.confirmDate);
  });

  async function handleAddClosure() {
    try {
      const form = await openClosureDialog();
      if (!form) return;
      const res = await ClosureService.addClosure(form.date, form.reason, adminId);
      flashNote(res.code);
      if (res.ok) await renderAll(); // affects KPIs/table too — everyone on that date is excused
    } catch (error) {
      await AuditService.logError("adminPage.handleAddClosure", error);
      flashNote(CODE.GENERIC_ERROR);
    }
  }

  async function handleRemoveClosure(date) {
    try {
      const res = await ClosureService.removeClosure(date, adminId);
      flashNote(res.code);
      if (res.ok) await renderAll();
    } catch (error) {
      await AuditService.logError("adminPage.handleRemoveClosure", error);
      flashNote(CODE.GENERIC_ERROR);
    }
  }

  on(byId("addClosureBtn"), "click", handleAddClosure);
  on(byId("closuresTableBody"), "click", (e) => {
    const btn = e.target.closest("[data-remove-closure]");
    if (btn) handleRemoveClosure(btn.dataset.removeClosure);
  });

  // ---- Employees: add / mark left / reactivate / remove ----

  async function handleAddEmployee() {
    try {
      const form = await openAddEmployeeDialog();
      if (!form) return;
      const res = await EmployeeService.addEmployee(form.name, adminId, form.startDate);
      flashEmployeesNote(res.code);
      if (res.ok) {
        await renderEmployeesSection();
        await populateEmployeeFilter();
        await render();
      }
    } catch (error) {
      await AuditService.logError("adminPage.handleAddEmployee", error);
      flashEmployeesNote(CODE.GENERIC_ERROR);
    }
  }

  async function handleMarkLeft(employeeId) {
    try {
      const roster = await EmployeeService.getRoster();
      const employee = roster.find((e) => e.id === employeeId);
      if (!employee) return;
      const form = await openEmployeeStatusDialog(employee);
      if (!form) return;
      const res = await EmployeeService.setEmployeeStatus(employeeId, form, adminId);
      flashEmployeesNote(res.code);
      if (res.ok) {
        await renderEmployeesSection();
        await populateEmployeeFilter();
        await renderAll(); // this employee may now be excluded from today's KPIs/table
      }
    } catch (error) {
      await AuditService.logError("adminPage.handleMarkLeft", error);
      flashEmployeesNote(CODE.GENERIC_ERROR);
    }
  }

  async function handleReactivate(employeeId) {
    try {
      const res = await EmployeeService.reactivateEmployee(employeeId, adminId);
      flashEmployeesNote(res.code);
      if (res.ok) {
        await renderEmployeesSection();
        await populateEmployeeFilter();
        await renderAll();
      }
    } catch (error) {
      await AuditService.logError("adminPage.handleReactivate", error);
      flashEmployeesNote(CODE.GENERIC_ERROR);
    }
  }

  async function handleRemove(employeeId) {
    try {
      const roster = await EmployeeService.getRoster();
      const employee = roster.find((e) => e.id === employeeId);
      if (!employee) return;
      const confirmed = await confirmDialog(
        `Remove ${employee.name}?`,
        "This permanently deletes them from the roster and can't be undone. Only possible if they have no attendance history yet.",
        "Remove",
        "Cancel"
      );
      if (!confirmed) return;

      const res = await EmployeeService.removeEmployee(employeeId, adminId);
      flashEmployeesNote(res.code);
      if (res.ok) {
        await renderEmployeesSection();
        await populateEmployeeFilter();
        await renderAll();
      }
    } catch (error) {
      await AuditService.logError("adminPage.handleRemove", error);
      flashEmployeesNote(CODE.GENERIC_ERROR);
    }
  }

  on(byId("addEmployeeBtn"), "click", handleAddEmployee);

  on(byId("employeeProfileClose"), "click", closeEmployeeProfile);
  on(byId("employeeProfileOverlay"), "click", (e) => {
    if (e.target.id === "employeeProfileOverlay") closeEmployeeProfile();
  });
  on(document, "keydown", (e) => {
    if (e.key === "Escape") closeEmployeeProfile();
  });

  on(byId("dirSearchInput"), "input", renderEmployeesSection);
  ["dirFilterStore", "dirFilterRole", "dirFilterStatus", "dirSortBy"].forEach((id) => {
    on(byId(id), "change", renderEmployeesSection);
  });

  // Quick actions: new entry points to the SAME handlers/filters already wired above.
  on(byId("qaAddEmployee"), "click", handleAddEmployee);
  on(byId("qaDeclareClosure"), "click", handleAddClosure);
  on(byId("qaViewLate"), "click", () => {
    showAdminSection("dashboard");
    filters.date.value = "today";
    filters.status.value = "late";
    render();
  });

  on(byId("employeesTableBody"), "click", (e) => {
    const markLeftBtn = e.target.closest("[data-mark-left]");
    const reactivateBtn = e.target.closest("[data-reactivate]");
    const removeBtn = e.target.closest("[data-remove]");
    const row = e.target.closest("[data-employee-row]");
    if (markLeftBtn) handleMarkLeft(markLeftBtn.dataset.markLeft);
    else if (reactivateBtn) handleReactivate(reactivateBtn.dataset.reactivate);
    else if (removeBtn) handleRemove(removeBtn.dataset.remove);
    else if (row) openEmployeeProfile(row.dataset.employeeRow);
  });

  // ---- Section switching: Dashboard vs Employees (the other nav items stay cosmetic for now) ----

  function showAdminSection(name) {
    byId("adminSection-dashboard").style.display = name === "employees" ? "none" : "block";
    byId("adminSection-employees").style.display = name === "employees" ? "block" : "none";
  }

  qsa("[data-admin-nav]").forEach((btn) => {
    on(btn, "click", () => showAdminSection(btn.dataset.adminNav === "employees" ? "employees" : "dashboard"));
  });

  // ---- Filters ----

  qsa("select", document).forEach((sel) => {
    if (Object.values(filters).includes(sel)) on(sel, "change", render);
  });

  return {
    async mount(user, id) {
      adminId = id;
      renderWelcomeHeader({
        greetingEl: byId("adminWelcomeGreeting"),
        nameEl: byId("adminGreeting"),
        roleEl: byId("adminWelcomeRole"),
        subEl: byId("adminDateSub"),
        fullName: user.name,
        role: user.role,
        storeLabel: user.store,
        holidayLabel: (ShiftEngine.getHolidayFor(new Date()) || {}).label
      });
      renderTodaysValue({ nameEl: byId("adminTodaysValueName"), bodyEl: byId("adminTodaysValueBody") });
      showAdminSection("dashboard");

      const loadingBar = byId("adminLoadingBar");
      loadingBar.style.display = "block";
      await populateEmployeeFilter();
      await renderAll();
      loadingBar.style.display = "none";
      maybeShowOnboarding(user.role, user.name.split(" ")[0]);
    },
    refresh: renderAll
  };
}
