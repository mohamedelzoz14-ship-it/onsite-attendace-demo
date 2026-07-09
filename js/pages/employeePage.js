/**
 * employeePage.js
 * Wires the employee dashboard. This file's only job is DOM + orchestration —
 * every attendance/shift/location/validation decision is delegated to the
 * services below. No business rule or message string lives in this file.
 *
 * Migration note: every render function and click handler is now `async`
 * (the engines they call now talk to Supabase). No UI behavior, message,
 * or decision changed — every function does exactly what it did before,
 * it just awaits the result now instead of getting it back instantly.
 */
import { AttendanceEngine } from "../services/attendanceEngine.js";
import { ShiftEngine } from "../services/shiftEngine.js";
import { LocationService } from "../services/locationService.js";
import { RequestService } from "../services/requestService.js";
import { ClosureService } from "../services/closureService.js";
import { NotificationService } from "../services/notificationService.js";
import { AuditService } from "../services/auditService.js";
import { HOME_STORE, getStoreById } from "../config/stores.js";
import { NOTIFICATION_CODES as CODE, NOTIFICATION_TYPES as TYPE, REQUEST_TYPE_LABELS } from "../config/constants.js";
import { formatTime, formatShiftMinutes, formatShortDate, todayKey } from "../utils/dateUtils.js";
import { pillHtml } from "../components/badge.js";
import { renderTable } from "../components/table.js";
import { createCheckInButton } from "../components/checkInButton.js";
import { createBanner } from "../components/notifications.js";
import { openCorrectionDialog } from "../components/requestDialog.js";
import { openLeaveDialog } from "../components/leaveDialog.js";
import { renderWelcomeHeader, renderTodaysValue } from "../components/header.js";
import { maybeShowOnboarding } from "../components/onboarding.js";
import { renderEmployeeStatCards } from "../components/card.js";
import { byId, on, escapeHtml } from "../utils/domUtils.js";

/** Maps a NotificationService severity to the location-note's CSS state classes. */
function bannerStateFor(type) {
  if (type === TYPE.SUCCESS) return "ok";
  if (type === TYPE.ERROR || type === TYPE.WARNING) return "error";
  return "checking"; // INFO
}

export function initEmployeePage() {
  const refs = {
    button: byId("checkinBtn"),
    label: byId("checkinLabel"),
    sub: byId("checkinSub"),
    badge: byId("empStatusBadge"),
    badgeText: byId("empStatusText"),
    meta: byId("checkinMeta")
  };
  const checkInButton = createCheckInButton(refs);

  const locationNoteEl = byId("locationNote");
  const locationBanner = createBanner(locationNoteEl, byId("locationNoteText"), "location-note");

  const requestBanner = createBanner(byId("requestNote"), byId("requestNoteText"), "location-note");
  const DEFAULT_REQUEST_HINT = 'Forgot to check out one day? Use "Fix" next to that row to request a correction.';

  /** @param {string} code @param {object} [params] */
  function notify(code, params) {
    const { type, message } = NotificationService.get(code, params);
    locationBanner.set(bannerStateFor(type), message);
  }

  let employeeId = null;

  /** @param {string} storeId @returns {string|null} a "covering at X" note if this record's store isn't the employee's home store. */
  function coveringNote(storeId) {
    if (storeId === HOME_STORE.id) return null;
    const store = getStoreById(storeId);
    return `🔄 Covering at ${store ? store.label : storeId} today.`;
  }

  async function renderState() {
    const todayRecord = await AttendanceEngine.getTodayRecord(employeeId);
    const qr = LocationService.getQrContext();

    if (!todayRecord) {
      const closure = await ClosureService.getClosureFor(todayKey());
      if (closure) {
        checkInButton.showDayOff("Store closed", closure.reason || "Closed today");
        notify(CODE.STORE_CLOSED_TODAY, { reason: closure.reason });
        return;
      }

      if (await RequestService.hasApprovedLeaveFor(employeeId, todayKey())) {
        checkInButton.showDayOff("On leave", "Approved leave today");
        notify(CODE.ON_APPROVED_LEAVE);
        return;
      }

      if (ShiftEngine.isDayOff(employeeId)) {
        checkInButton.showDayOff();
        notify(CODE.NOTHING_TO_CHECK_IN);
        return;
      }

      // Normal working day — check in as usual. A public holiday never blocks
      // this (most retail stays open); it just gets flagged for holiday pay.
      const shift = ShiftEngine.getShiftInfo(employeeId);
      checkInButton.showNotCheckedIn(formatShiftMinutes(shift.start));
      const holiday = ShiftEngine.getHolidayFor(new Date());
      if (holiday) {
        notify(CODE.PUBLIC_HOLIDAY_WORKING, { label: holiday.label });
      } else {
        notify(qr.present ? (qr.valid ? CODE.QR_INFO_VALID : CODE.QR_INFO_INVALID) : CODE.QR_INFO_NONE);
      }
      return;
    }

    if (!todayRecord.checkOutTime) {
      checkInButton.showCheckedIn(todayRecord);
      locationBanner.set("ok", coveringNote(todayRecord.store) || "Checked in from store location.");
    } else {
      checkInButton.showCompleted(todayRecord);
      locationBanner.set("ok", coveringNote(todayRecord.store) || "Shift complete for today.");
    }
  }

  async function renderHistory() {
    const rows = await AttendanceEngine.getHistory(employeeId, 7);

    // Most recent request per date, so a rejected-then-resubmitted day shows
    // the latest state rather than an old one.
    const latestRequestByDate = new Map();
    const employeeRequests = await RequestService.getRequestsForEmployee(employeeId);
    employeeRequests.forEach((r) => {
      const existing = latestRequestByDate.get(r.targetDate);
      if (!existing || r.requestedAt > existing.requestedAt) latestRequestByDate.set(r.targetDate, r);
    });

    renderTable(
      byId("empHistoryBody"),
      rows,
      (r) => {
        let action = "";
        if (r.status === "missing") {
          const req = latestRequestByDate.get(r.date);
          action =
            req && req.status === "pending"
              ? `<button class="link-btn pending" disabled>Pending review</button>`
              : `<button class="link-btn" data-fix-date="${r.date}">Fix</button>`;
        }
        return `<tr><td class="strong">${formatShortDate(r.date)}</td><td>${formatTime(r.checkInTime)}</td><td>${formatTime(r.checkOutTime)}</td><td>${pillHtml(r.status)}${action}</td></tr>`;
      },
      4,
      NotificationService.get(CODE.NO_RECORDS_HISTORY).message
    );
  }

  /** Reuses the SAME RequestService.getRequestsForEmployee() call renderHistory() already
   * makes internally — no new business logic, just a dedicated panel to see it directly
   * instead of only inferring it from the "Fix"/"Pending review" button on history rows. */
  async function renderMyRequests() {
    const requests = await RequestService.getRequestsForEmployee(employeeId);
    const statusPillClass = { pending: "leave", approved: "present", rejected: "absent" };

    renderTable(
      byId("empRequestsBody"),
      requests,
      (r) => `<tr>
        <td class="strong">${REQUEST_TYPE_LABELS[r.type] || r.type}</td>
        <td>${formatShortDate(r.targetDate)}</td>
        <td class="reason-cell">${escapeHtml(r.reason) || "—"}</td>
        <td><span class="pill ${statusPillClass[r.status] || "leave"}"><span class="dot"></span>${r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span></td>
      </tr>`,
      4,
      "You haven't submitted any requests yet."
    );
  }

  async function renderStats() {
    const shift = ShiftEngine.getShiftInfo(employeeId);
    const shiftKey = ShiftEngine.getShiftKeyFor(employeeId);
    const onLeave = await RequestService.hasApprovedLeaveFor(employeeId, todayKey());
    const holiday = ShiftEngine.getHolidayFor(new Date());

    let shiftLabel;
    if (onLeave) shiftLabel = "Approved leave";
    else if (shiftKey === "off") shiftLabel = "Enjoy your day";
    else if (holiday) shiftLabel = `${shift.label} · 🎉 ${holiday.label}`;
    else shiftLabel = `${shift.label} · ${HOME_STORE.label}`;

    const [monthSummary, weekHours] = await Promise.all([
      AttendanceEngine.getMonthSummary(employeeId),
      AttendanceEngine.getWeekHours(employeeId)
    ]);

    renderEmployeeStatCards({
      shiftLabel,
      shiftTimeRange: onLeave || shift.start === null ? "Off today" : `${formatShiftMinutes(shift.start)} – ${formatShiftMinutes(shift.end)}`,
      monthSummary,
      weekHours
    });
  }

  /**
   * Full check-in flow: validate -> verify location/QR -> write the record.
   * Wrapped end-to-end so a geolocation failure, a storage error, or any
   * unexpected exception always resolves to a visible message instead of a
   * silently broken button.
   */
  async function handleCheckInClick() {
    try {
      const validation = await AttendanceEngine.validateCheckIn(employeeId);
      if (!validation.valid) {
        notify(validation.code);
        return;
      }

      const qr = LocationService.getQrContext();
      if (qr.present && !qr.valid) {
        notify(CODE.QR_MISMATCH);
        return;
      }

      checkInButton.showLocating();
      notify(CODE.LOCATION_CHECKING);

      // If a QR named a specific store, only that store's geofence counts;
      // otherwise every known store is checked and the nearest in-range one wins.
      const location = await LocationService.verify(qr.store ? qr.store.id : undefined);
      if (!location.ok) {
        checkInButton.resetLabelToCheckIn();
        notify(location.code, location.params);
        return;
      }

      notify(qr.present ? CODE.LOCATION_OK_WITH_QR : CODE.LOCATION_OK_NO_QR);

      const checkInResult = await AttendanceEngine.checkIn(employeeId, currentUser.name, location.store.id);
      if (!checkInResult.ok) {
        notify(checkInResult.code);
        checkInButton.resetLabelToCheckIn();
        return;
      }

      await renderState();
      await renderHistory();
      await renderStats();
    } catch (error) {
      await AuditService.logError("employeePage.handleCheckInClick", error);
      checkInButton.resetLabelToCheckIn();
      notify(CODE.GENERIC_ERROR);
    }
  }

  async function handleCheckOutClick() {
    try {
      const checkOutResult = await AttendanceEngine.checkOut(employeeId);
      if (!checkOutResult.ok) {
        notify(checkOutResult.code);
        return;
      }
      await renderState();
      await renderHistory();
      await renderStats();
    } catch (error) {
      await AuditService.logError("employeePage.handleCheckOutClick", error);
      notify(CODE.GENERIC_ERROR);
    }
  }

  /**
   * Opens the correction dialog for a specific "missing check-out" day and
   * submits the request. Wrapped in try/catch like every other action here —
   * a bad date format or a storage error surfaces as a banner, not a crash.
   * @param {string} dateKey - YYYY-MM-DD, the row's date
   */
  async function handleFixClick(dateKey) {
    try {
      const history = await AttendanceEngine.getHistory(employeeId, 7);
      const record = history.find((r) => r.date === dateKey);
      if (!record) return;

      const form = await openCorrectionDialog({
        dateLabel: formatShortDate(dateKey),
        checkInLabel: formatTime(record.checkInTime)
      });
      if (!form) return; // cancelled

      const [h, m] = form.checkOutTime.split(":").map(Number);
      const [y, mo, d] = dateKey.split("-").map(Number);
      const proposedIso = new Date(y, mo - 1, d, h, m).toISOString();

      const submitResult = await RequestService.submitMissedCheckoutCorrection(
        employeeId,
        currentUser.name,
        dateKey,
        proposedIso,
        form.reason
      );

      const { type, message } = NotificationService.get(submitResult.code);
      requestBanner.set(bannerStateFor(type), message);

      if (submitResult.ok) {
        await renderHistory();
        await renderMyRequests();
      }
    } catch (error) {
      await AuditService.logError("employeePage.handleFixClick", error);
      requestBanner.set("error", NotificationService.get(CODE.GENERIC_ERROR).message);
    }
  }

  /**
   * Opens the planned-leave dialog and submits the request. Unlike a
   * missed-checkout correction, this isn't tied to any specific history row —
   * it's for a future (or today's) date the employee won't be coming in.
   */
  async function handleRequestLeaveClick() {
    try {
      const form = await openLeaveDialog();
      if (!form) return; // cancelled

      let submitResult;
      if (form.type === "sick") {
        submitResult = await RequestService.submitSickLeave(employeeId, currentUser.name, form.date, form.reason);
      } else if (form.type === "early") {
        submitResult = await RequestService.submitEarlyLeave(employeeId, currentUser.name, form.date, form.reason, form.expectedTime);
      } else {
        submitResult = await RequestService.submitPlannedLeave(employeeId, currentUser.name, form.date, form.reason);
      }

      const { type, message } = NotificationService.get(submitResult.code);
      requestBanner.set(bannerStateFor(type), message);

      if (submitResult.ok) {
        await renderState(); // in case the requested date is today
        await renderMyRequests();
      }
    } catch (error) {
      await AuditService.logError("employeePage.handleRequestLeaveClick", error);
      requestBanner.set("error", NotificationService.get(CODE.GENERIC_ERROR).message);
    }
  }

  let currentUser = null;

  on(refs.button, "click", async () => {
    if (refs.button.disabled || !employeeId) return;
    const todayRecord = await AttendanceEngine.getTodayRecord(employeeId);
    if (!todayRecord) {
      await handleCheckInClick();
    } else if (!todayRecord.checkOutTime) {
      await handleCheckOutClick();
    }
  });

  // Event delegation: history rows are fully re-rendered on every update, so
  // one listener on the table body handles every "Fix" button, present or future.
  on(byId("empHistoryBody"), "click", (e) => {
    const btn = e.target.closest("[data-fix-date]");
    if (btn) handleFixClick(btn.dataset.fixDate);
  });

  on(byId("requestLeaveBtn"), "click", handleRequestLeaveClick);

  return {
    /** Called by main.js right after a successful employee login. */
    async mount(user, id) {
      employeeId = id;
      currentUser = user;
      byId("empName").textContent = user.name.split(" ")[0] + " " + user.name.split(" ")[1][0] + ".";
      byId("empAvatar").textContent = user.initial;
      byId("empStoreLabel").textContent = user.store;
      renderWelcomeHeader({
        greetingEl: byId("empWelcomeGreeting"),
        nameEl: byId("empGreeting"),
        roleEl: byId("empWelcomeRole"),
        subEl: byId("empDateSub"),
        fullName: user.name,
        role: user.role,
        storeLabel: user.store,
        holidayLabel: (ShiftEngine.getHolidayFor(new Date()) || {}).label
      });
      renderTodaysValue({ nameEl: byId("empTodaysValueName"), bodyEl: byId("empTodaysValueBody") });

      const loadingBar = byId("empLoadingBar");
      loadingBar.style.display = "block";
      await Promise.all([renderState(), renderHistory(), renderStats(), renderMyRequests()]);
      loadingBar.style.display = "none";

      requestBanner.set("checking", DEFAULT_REQUEST_HINT);
      maybeShowOnboarding(user.role, user.name.split(" ")[0]);
    },
    unmount() {
      checkInButton.destroy();
      employeeId = null;
      currentUser = null;
    }
  };
}
