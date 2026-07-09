/**
 * dmPage.js
 * Wires the District Manager dashboard. Like adminPage.js and employeePage.js,
 * this file only handles DOM + orchestration — every number on screen comes
 * from dmReportsService.js, which itself only reads from the existing
 * services (never modifies attendanceEngine.js, shiftEngine.js, or
 * reportsService.js).
 *
 * Migration note: every render function and handler is now `async`. No
 * calculation or rendered value changed. The four independent renders in
 * renderAll() (cards, charts, stores overview, table) now run concurrently
 * via Promise.all, since each writes to its own DOM element and none
 * depends on another's result.
 */
import { DMReportsService } from "../services/dmReportsService.js";
import { EmployeeService } from "../services/employeeService.js";
import { AuditService } from "../services/auditService.js";
import { NotificationService } from "../services/notificationService.js";
// StorageService is imported directly here (not via a new dmReportsService.js
// method) specifically to avoid modifying ANY service file this sprint — the
// instruction was explicit: no backend/business-logic changes. This is a
// read-only call to an already-existing, unmodified method.
import { StorageService } from "../services/storageService.js";
import { SHIFTS } from "../config/shiftConfig.js";
import { STORES } from "../config/stores.js";
import { formatTime, formatShortDate, todayKey } from "../utils/dateUtils.js";
import { pillHtml } from "../components/badge.js";
import { renderTable } from "../components/table.js";
import { renderWelcomeHeader, renderTodaysValue } from "../components/header.js";
import { openDMAddEmployeeDialog, openDMManageEmployeesDialog } from "../components/employeeDialogs.js";
import { openDMRequestsDialog } from "../components/dmRequestsDialog.js";
import { RequestService } from "../services/requestService.js";
import { renderLineChart, renderBarChart } from "../components/charts.js";
import { exportRowsToExcel } from "../components/exportExcel.js";
import { animateCounter } from "../utils/animateCounter.js";
import { maybeShowOnboarding } from "../components/onboarding.js";
import { byId, on, qsa } from "../utils/domUtils.js";

export function initDMPage() {
  const filters = {
    date: byId("dmFilterDate"),
    store: byId("dmFilterStore"),
    employee: byId("dmFilterEmployee"),
    shift: byId("dmFilterShift")
  };
  const searchInput = byId("dmSearchInput");

  /** Populates the store and shift filter dropdowns once from config — these don't change at runtime. */
  function populateStaticFilters() {
    STORES.forEach((store) => {
      const opt = document.createElement("option");
      opt.value = store.id;
      opt.textContent = store.label;
      filters.store.appendChild(opt);
    });
    Object.entries(SHIFTS).forEach(([key, shift]) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = shift.label;
      filters.shift.appendChild(opt);
    });
  }

  /** Rebuilds the date filter's last-30-days options and the employee filter from the live roster. */
  async function populateDynamicFilters() {
    const currentDate = filters.date.value;
    filters.date.innerHTML = "";
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = todayKey(d);
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = i === 0 ? `Today (${formatShortDate(key)})` : formatShortDate(key);
      filters.date.appendChild(opt);
    }
    if ([...filters.date.options].some((o) => o.value === currentDate)) filters.date.value = currentDate;

    const currentEmployee = filters.employee.value;
    filters.employee.innerHTML = '<option value="all">All employees</option>';
    const roster = await EmployeeService.getRoster();
    roster.forEach((emp) => {
      const opt = document.createElement("option");
      opt.value = emp.id;
      opt.textContent = emp.endDate ? `${emp.name} (${emp.endReason})` : emp.name;
      filters.employee.appendChild(opt);
    });
    if ([...filters.employee.options].some((o) => o.value === currentEmployee)) filters.employee.value = currentEmployee;
  }

  /** Pure text generation from numbers the dashboard already fetched and
   * already displays as KPI cards — this doesn't compute anything new,
   * it just turns already-known numbers into a couple of short sentences. */
  function buildInsights(cards) {
    const insights = [];
    if (cards.absent > 0) {
      insights.push(`${cards.absent} employee${cards.absent === 1 ? "" : "s"} absent across the district today.`);
    }
    if (cards.late > 0) {
      insights.push(`${cards.late} employee${cards.late === 1 ? "" : "s"} arrived late today.`);
    }
    if (cards.onLeave > 0) {
      insights.push(`${cards.onLeave} employee${cards.onLeave === 1 ? "" : "s"} on approved leave today.`);
    }
    if (insights.length === 0) {
      insights.push("Full attendance across the district today — no absences or late arrivals.");
    }
    return insights.slice(0, 3);
  }

  async function renderCards() {
    try {
      const cards = await DMReportsService.getOverviewCards();
      animateCounter(byId("dmTotalEmployees"), cards.totalEmployees);
      animateCounter(byId("dmPresent"), cards.present);
      animateCounter(byId("dmLate"), cards.late);
      animateCounter(byId("dmAbsent"), cards.absent);
      animateCounter(byId("dmOff"), cards.off);
      animateCounter(byId("dmOnLeave"), cards.onLeave);

      byId("dmInsightsList").innerHTML = buildInsights(cards)
        .map((text) => `<li>${text}</li>`)
        .join("");

      const briefEl = byId("execBriefText");
      if (briefEl) {
        briefEl.textContent = `${cards.present} of ${cards.totalEmployees} team members active across the district today`;
      }
      return cards;
    } catch (error) {
      await AuditService.logError("dmPage.renderCards", error);
    }
  }

  let currentPeriod = "daily";

  /** Rolls up daily values into weekly/monthly buckets — pure array math on
   * data already fetched, no new service logic. Sums counts, averages percentages. */
  function aggregateByPeriod(dailyLabels, dailyValues, period, isPercentage) {
    if (period === "daily") return { labels: dailyLabels, values: dailyValues };
    const bucketSize = period === "weekly" ? 7 : 30;
    const labels = [];
    const values = [];
    for (let i = 0; i < dailyValues.length; i += bucketSize) {
      const chunk = dailyValues.slice(i, i + bucketSize);
      const sum = chunk.reduce((a, b) => a + b, 0);
      values.push(isPercentage ? Math.round(sum / chunk.length) : Math.round(sum * 10) / 10);
      labels.push(dailyLabels[i]);
    }
    return { labels, values };
  }

  /** How many raw days to fetch so each period has several buckets to show,
   * not just one — still just calling the EXISTING getDailyTrend(days) with
   * a larger days argument, a parameter it already supported. */
  function daysNeededFor(period) {
    if (period === "weekly") return 84; // 12 weekly buckets
    if (period === "monthly") return 180; // 6 monthly buckets
    return 30;
  }

  /** Overtime trend — computed directly from StorageService.getRecords()
   * (an existing, unmodified method) rather than adding a new method to
   * dmReportsService.js, so that file stays completely untouched this sprint. */
  async function getOvertimeTrendDaily(days) {
    const records = await StorageService.getRecords();
    const labels = [];
    const values = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = todayKey(d);
      const overtimeSum = records
        .filter((r) => r.date === key)
        .reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
      labels.push(key);
      values.push(Math.round(overtimeSum * 10) / 10);
    }
    return { labels, values };
  }

  const PERIOD_TITLE_SUFFIX = { daily: "last 30 days", weekly: "last 12 weeks", monthly: "last 6 months" };

  async function renderCharts(period = currentPeriod) {
    try {
      currentPeriod = period;
      const days = daysNeededFor(period);
      const [trend, overtime] = await Promise.all([DMReportsService.getDailyTrend(days), getOvertimeTrendDaily(days)]);

      const present = aggregateByPeriod(trend.labels, trend.present, period, false);
      const late = aggregateByPeriod(trend.labels, trend.late, period, false);
      const pct = aggregateByPeriod(trend.labels, trend.attendancePct, period, true);
      const ot = aggregateByPeriod(overtime.labels, overtime.values, period, false);

      const suffix = PERIOD_TITLE_SUFFIX[period];
      byId("dmChartAttendanceTitle").textContent = `Attendance trend (${suffix})`;
      byId("dmChartLateTitle").textContent = `Late trend (${suffix})`;
      byId("dmChartPercentageTitle").textContent = `Daily attendance % (${suffix})`;
      byId("dmChartOvertimeTitle").textContent = `Overtime trend (${suffix})`;

      const presentLabels = present.labels.map((key) => formatShortDate(key));
      renderLineChart("dmChartAttendance", presentLabels, [
        { label: "Present", data: present.values, color: "#0A0A0A" },
        { label: "Late", data: late.values, color: "#9A6700" }
      ]);
      renderBarChart("dmChartLate", presentLabels, late.values, "#9A6700");
      renderLineChart("dmChartPercentage", presentLabels, [{ label: "Attendance %", data: pct.values, color: "#1B7A3D" }]);
      renderBarChart("dmChartOvertime", ot.labels.map((key) => formatShortDate(key)), ot.values, "#6B6B68");
    } catch (error) {
      await AuditService.logError("dmPage.renderCharts", error);
    }
  }

  async function renderStoresOverview() {
    try {
      const stores = await DMReportsService.getStoresOverview();
      const grid = byId("dmStoresGrid");
      grid.innerHTML = stores
        .map(
          (s) => `
        <div class="store-overview-card">
          <div class="store-name">${s.storeLabel}</div>
          <div class="store-count">${s.employeeCount} employee${s.employeeCount === 1 ? "" : "s"}</div>
          <div class="stat-row"><span class="stat-label">Present</span><span class="stat-value present">${s.present}</span></div>
          <div class="stat-row"><span class="stat-label">Late</span><span class="stat-value late">${s.late}</span></div>
          <div class="stat-row"><span class="stat-label">Absent</span><span class="stat-value absent">${s.absent}</span></div>
          <div class="stat-row"><span class="stat-label">Off</span><span class="stat-value">${s.off}</span></div>
        </div>`
        )
        .join("");
    } catch (error) {
      await AuditService.logError("dmPage.renderStoresOverview", error);
    }
  }

  function getCurrentFilters() {
    return {
      date: filters.date.value,
      storeId: filters.store.value,
      employeeId: filters.employee.value,
      shift: filters.shift.value,
      search: searchInput.value
    };
  }

  async function renderTableRows() {
    try {
      const rows = await DMReportsService.getEmployeeTableRows(getCurrentFilters());
      renderTable(
        byId("dmTableBody"),
        rows,
        (r) => `<tr>
          <td class="strong">${r.employeeId}</td>
          <td>${r.name}</td>
          <td>${r.store}</td>
          <td>${r.shift ? SHIFTS[r.shift].label : "—"}</td>
          <td>${pillHtml(r.status)}</td>
          <td>${formatTime(r.checkInTime)}</td>
          <td>${formatTime(r.checkOutTime)}</td>
          <td>${r.totalHours != null ? r.totalHours + " hrs" : "—"}</td>
        </tr>`,
        8,
        "No attendance records match these filters.",
        "No matches"
      );
    } catch (error) {
      await AuditService.logError("dmPage.renderTableRows", error);
    }
  }

  async function renderAll() {
    // Independent panels, each writing to its own DOM element — run concurrently.
    const [cards] = await Promise.all([renderCards(), renderCharts(), renderStoresOverview(), renderTableRows(), updatePendingBadge()]);
    return cards;
  }

  async function handleExport() {
    try {
      const rows = await DMReportsService.getEmployeeTableRows(getCurrentFilters());
      const dateLabel = getCurrentFilters().date || todayKey();
      exportRowsToExcel(rows, `onsite-attendance-${dateLabel}.xlsx`);
    } catch (error) {
      await AuditService.logError("dmPage.handleExport", error);
    }
  }

  /** A small, self-contained confirmation toast — the DM dashboard has no
   * inline banner element like the admin screen did, and a brief toast is
   * the right weight for "employee added" feedback. */
  function showDMToast(message, ok = true) {
    const toast = document.createElement("div");
    toast.textContent = message;
    toast.style.cssText =
      `position:fixed; bottom:24px; left:50%; transform:translateX(-50%) translateY(10px); z-index:1200;
       background:${ok ? "var(--black)" : "var(--red)"}; color:var(--white); padding:13px 22px;
       border-radius:var(--radius-sm); font-size:14px; font-weight:600; box-shadow:var(--shadow-lg);
       opacity:0; transition:opacity 0.2s var(--ease), transform 0.2s var(--ease);`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateX(-50%) translateY(0)";
    });
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(10px)";
      setTimeout(() => { if (toast.parentNode) document.body.removeChild(toast); }, 250);
    }, 2600);
  }

  async function handleAddEmployee() {
    try {
      const form = await openDMAddEmployeeDialog(STORES);
      if (!form) return;
      // "8000" is the DM's login code, recorded as who added the employee
      // in the audit trail.
      const res = await EmployeeService.addEmployee(form.name, "8000", form.startDate, form.store, form.title);
      if (res.ok) {
        const storeLabel = (STORES.find((s) => s.id === form.store) || {}).label || form.store;
        showDMToast(`${form.name} added to ${storeLabel}.`, true);
        await renderAll();
      } else {
        showDMToast(NotificationService.get(res.code).message, false);
      }
    } catch (error) {
      await AuditService.logError("dmPage.handleAddEmployee", error);
      showDMToast("Something went wrong. Please try again.", false);
    }
  }

  async function updatePendingBadge() {
    try {
      const pending = await RequestService.getPendingRequests();
      const badge = byId("dmPendingBadge");
      if (!badge) return;
      if (pending.length > 0) {
        badge.textContent = pending.length;
        badge.style.display = "inline-flex";
      } else {
        badge.style.display = "none";
      }
    } catch (error) {
      await AuditService.logError("dmPage.updatePendingBadge", error);
    }
  }

  async function handleRequests() {
    try {
      const [pending, roster] = await Promise.all([
        RequestService.getPendingRequests(),
        EmployeeService.getRoster()
      ]);
      const storeLabelFor = (id) => (STORES.find((s) => s.id === id) || {}).label || id;
      openDMRequestsDialog(pending, storeLabelFor, roster, {
        async onApprove(id) {
          const res = await RequestService.approveRequest(id, "8000");
          showDMToast(res.ok ? "Request approved." : NotificationService.get(res.code).message, res.ok);
          await updatePendingBadge();
          await renderAll();
        },
        async onReject(id) {
          const res = await RequestService.rejectRequest(id, "8000");
          showDMToast(res.ok ? "Request rejected." : NotificationService.get(res.code).message, res.ok);
          await updatePendingBadge();
          await renderAll();
        }
      });
    } catch (error) {
      await AuditService.logError("dmPage.handleRequests", error);
      showDMToast("Something went wrong. Please try again.", false);
    }
  }

  /** A brief, elegant welcome splash shown once when the DM opens the
   * dashboard — "Welcome, Mr <name>" with a smooth fade/rise and a lime
   * underline sweep, then it dissolves. Pure delight, no blocking: it sits
   * on top, plays for ~2s, and removes itself. */
  function showWelcomeSplash(fullName) {
    const honorific = `Mr ${fullName.split(" ")[0]}`;
    const splash = document.createElement("div");
    splash.style.cssText =
      `position:fixed; inset:0; z-index:2000; display:flex; align-items:center; justify-content:center;
       background:radial-gradient(circle at 50% 50%, #141414 0%, #0A0A0A 100%);
       opacity:0; transition:opacity 0.5s var(--ease);`;
    splash.innerHTML = `
      <div style="text-align:center; transform:translateY(14px); opacity:0; transition:transform 0.7s var(--ease), opacity 0.7s var(--ease);" data-inner>
        <div style="font-family:var(--font-display); font-size:15px; letter-spacing:0.24em; text-transform:uppercase; color:var(--lime); margin-bottom:14px; opacity:0;" data-eyebrow>Onsite · Executive</div>
        <div style="font-family:var(--font-display); font-size:clamp(44px,8vw,88px); font-weight:700; text-transform:uppercase; color:#fff; line-height:0.95; letter-spacing:0.01em;">Welcome,<br>${honorific}</div>
        <div style="height:5px; width:0; background:var(--lime); margin:22px auto 0; border-radius:3px; transition:width 0.7s var(--ease) 0.3s;" data-rule></div>
      </div>`;
    document.body.appendChild(splash);

    const inner = splash.querySelector("[data-inner]");
    const rule = splash.querySelector("[data-rule]");
    const eyebrow = splash.querySelector("[data-eyebrow]");

    requestAnimationFrame(() => {
      splash.style.opacity = "1";
      inner.style.transform = "translateY(0)";
      inner.style.opacity = "1";
      rule.style.width = "120px";
      setTimeout(() => { eyebrow.style.transition = "opacity 0.5s ease"; eyebrow.style.opacity = "1"; }, 250);
    });

    setTimeout(() => {
      splash.style.opacity = "0";
      setTimeout(() => { if (splash.parentNode) document.body.removeChild(splash); }, 500);
    }, 2100);
  }

  async function handleManageEmployees() {
    try {
      const roster = await EmployeeService.getRoster();
      openDMManageEmployeesDialog(roster, STORES, {
        async onTransfer(id, dest) {
          const res = await EmployeeService.transferEmployee(id, dest, "8000");
          showDMToast(res.ok ? "Employee transferred." : NotificationService.get(res.code).message, res.ok);
          if (res.ok) await renderAll();
        },
        async onResign(id) {
          const res = await EmployeeService.setEmployeeStatus(id, { endDate: todayKey(), endReason: "resigned", transferredTo: null }, "8000");
          showDMToast(res.ok ? "Employee marked as resigned." : NotificationService.get(res.code).message, res.ok);
          if (res.ok) await renderAll();
        },
        async onRemove(id) {
          const res = await EmployeeService.removeEmployee(id, "8000");
          showDMToast(res.ok ? "Employee removed." : NotificationService.get(res.code).message, res.ok);
          if (res.ok) await renderAll();
        }
      });
    } catch (error) {
      await AuditService.logError("dmPage.handleManageEmployees", error);
      showDMToast("Something went wrong. Please try again.", false);
    }
  }

  populateStaticFilters();

  qsa(".period-btn").forEach((btn) => {
    on(btn, "click", () => {
      qsa(".period-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderCharts(btn.dataset.period);
    });
  });

  qsa("select", document).forEach((sel) => {
    if (Object.values(filters).includes(sel)) on(sel, "change", renderTableRows);
  });
  /** The achievable version of "a daily message" — since this is a static
   * site with no email/SMS/push infrastructure, nothing can be sent to the
   * DM independent of opening the app. This shows automatically the moment
   * they log in instead: a personal digest built from the same insights
   * already computed for the Operational Insights panel, so they don't
   * have to read the whole dashboard themselves to get the headline. */
  function showExecutiveDigest(firstName, cards) {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed; inset:0; background:rgba(10,10,10,0.6); display:flex; align-items:center; justify-content:center; z-index:1100; padding:20px;";

    const box = document.createElement("div");
    box.style.cssText =
      "background:var(--white); border-radius:var(--radius-lg); padding:32px 30px; max-width:400px; width:100%; box-shadow:var(--shadow-lg);";

    const insightsHtml = buildInsights(cards)
      .map((text) => `<li style="margin-bottom:7px;">${text}</li>`)
      .join("");

    box.innerHTML = `
      <div style="font-family:var(--font-display); font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--steel); margin-bottom:6px;">Executive Digest</div>
      <h3 style="font-family:var(--font-display); font-size:22px; font-weight:700; margin-bottom:14px;">Good to see you, ${firstName}.</h3>
      <ul style="padding-left:18px; font-size:13.5px; color:var(--gray-800); line-height:1.4; margin-bottom:22px;">${insightsHtml}</ul>
      <button data-dismiss style="width:100%; padding:12px; border-radius:var(--radius-sm); border:none; background:var(--black); color:var(--white); font-family:var(--font-display); font-weight:700; font-size:14px; letter-spacing:0.03em; text-transform:uppercase; cursor:pointer;">Take me to the dashboard</button>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function close() {
      document.body.removeChild(overlay);
    }
    box.querySelector("[data-dismiss]").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  }

  on(searchInput, "input", renderTableRows);
  on(byId("dmExportBtn"), "click", handleExport);
  on(byId("dmAddEmployeeBtn"), "click", handleAddEmployee);
  on(byId("dmManageBtn"), "click", handleManageEmployees);
  on(byId("dmRequestsBtn"), "click", handleRequests);

  return {
    async mount(user) {
      byId("dmName").textContent = user.name;
      byId("dmAvatar").textContent = user.initial;
      // A brief welcome splash greeting the DM by name — unless they've
      // asked the OS to reduce motion.
      if (!window.matchMedia || !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        showWelcomeSplash(user.name);
      }
      renderWelcomeHeader({
        greetingEl: byId("dmWelcomeGreeting"),
        nameEl: byId("dmGreeting"),
        roleEl: byId("dmWelcomeRole"),
        subEl: byId("dmDateSub"),
        fullName: user.name,
        role: user.role,
        storeLabel: user.store
      });
      renderTodaysValue({ nameEl: byId("dmTodaysValueName"), bodyEl: byId("dmTodaysValueBody") });

      // Personal watermark — the DM's own initials, computed from their real
      // name, never hardcoded.
      const initials = user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
      byId("execWatermark").textContent = initials;
      byId("execBriefDate").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

      const loadingBar = byId("dmLoadingBar");
      loadingBar.style.display = "block";
      await populateDynamicFilters();
      const cards = await renderAll();
      loadingBar.style.display = "none";
      const isFirstEverVisit = maybeShowOnboarding(user.role, user.name.split(" ")[0]);

      // Skip the digest on someone's very first-ever visit — the onboarding
      // modal is already showing, and two modals stacked on top of each
      // other would be a confusing first impression. They'll see the
      // digest normally starting their next login.
      // Reuses the SAME cards data renderAll() just fetched above — no
      // second network round-trip to Supabase for the same numbers.
      if (!isFirstEverVisit && cards) {
        showExecutiveDigest(user.name.split(" ")[0], cards);
      }
    },
    refresh: renderAll
  };
}
