/**
 * employeeProfile.js
 * Renders the read-only employee profile panel content. Takes a plain data
 * bundle the page already assembled (from EmployeeService, AttendanceEngine,
 * RequestService, and the SHIFTS/WEEKLY_SCHEDULE config — all existing,
 * unmodified) and turns it into markup. This file doesn't fetch or decide
 * anything itself.
 */
import { formatShortDate, formatTime, todayKey } from "../utils/dateUtils.js";
import { pillHtml } from "./badge.js";
import { escapeHtml } from "../utils/domUtils.js";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * @param {object} data
 * @param {object} data.employee - { id, name, startDate, endDate, endReason, transferredTo }
 * @param {string} data.roleLabel
 * @param {string} data.storeLabel
 * @param {string[]} data.weeklyShiftKeys - 7 entries, index 0 = Sunday, e.g. ["morning","off",...]
 * @param {object} data.shiftLabels - shiftKey -> display label (e.g. from config/shiftConfig.js SHIFTS)
 * @param {{daysWorked:number, daysSoFar:number, lateCount:number}} data.monthSummary
 * @param {object[]} data.recentHistory - from AttendanceEngine.getHistory()
 * @param {object[]} data.recentRequests - from RequestService.getRequestsForEmployee()
 * @param {string} data.requestTypeLabels - REQUEST_TYPE_LABELS map
 * @returns {string} HTML for #profilePanelContent
 */
export function renderEmployeeProfile(data) {
  const { employee, roleLabel, storeLabel, weeklyShiftKeys, shiftLabels, monthSummary, recentHistory, recentRequests, requestTypeLabels } = data;

  const initials = employee.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const isActive = !employee.startDate || employee.startDate <= todayStr();
  const isCurrentlyActive = isActiveNow(employee);

  const scheduleHtml = weeklyShiftKeys
    .map((key, i) => {
      const isOff = key === "off";
      const label = isOff ? "Off" : (shiftLabels[key] || key);
      return `<div class="profile-schedule-day ${isOff ? "is-off" : ""}">
        <div class="d-label">${DAY_LABELS[i]}</div>
        <div class="d-shift">${label.split(" ")[0]}</div>
      </div>`;
    })
    .join("");

  const historyRows = recentHistory.length
    ? recentHistory
        .map(
          (r) => `<tr>
            <td>${formatShortDate(r.date)}</td>
            <td>${formatTime(r.checkInTime)} – ${formatTime(r.checkOutTime)}</td>
            <td>${pillHtml(r.status)}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="3" style="color:var(--gray-500); padding:14px 0;">No attendance recorded yet.</td></tr>`;

  const requestRows = recentRequests.length
    ? recentRequests
        .slice(0, 5)
        .map(
          (r) => `<tr>
            <td>${requestTypeLabels[r.type] || r.type}</td>
            <td>${formatShortDate(r.targetDate)}</td>
            <td>${r.status.charAt(0).toUpperCase() + r.status.slice(1)}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="3" style="color:var(--gray-500); padding:14px 0;">No requests submitted yet.</td></tr>`;

  return `
    <div class="profile-header">
      <div class="profile-avatar">${initials}</div>
      <div>
        <div class="profile-name">${escapeHtml(employee.name)}</div>
        <div class="profile-role">${roleLabel} · ${employee.id}</div>
      </div>
    </div>

    <div class="profile-fields">
      <div><div class="profile-field-label">Employee ID</div><div class="profile-field-value">${employee.id}</div></div>
      <div><div class="profile-field-label">Store</div><div class="profile-field-value">${storeLabel}</div></div>
      <div><div class="profile-field-label">Role</div><div class="profile-field-value">${roleLabel}</div></div>
      <div><div class="profile-field-label">Status</div><div class="profile-field-value">${statusText(employee)}</div></div>
      <div><div class="profile-field-label">Join date</div><div class="profile-field-value">${employee.startDate ? formatShortDate(employee.startDate) : "—"}</div></div>
      <div><div class="profile-field-label">This month</div><div class="profile-field-value">${monthSummary.daysWorked} of ${monthSummary.daysSoFar} days worked</div></div>
    </div>

    <div class="profile-section-title">Weekly schedule</div>
    <div class="profile-schedule">${scheduleHtml}</div>

    <div class="profile-section-title">Recent attendance</div>
    <table class="profile-mini-table">${historyRows}</table>

    <div class="profile-section-title">Recent requests</div>
    <table class="profile-mini-table">${requestRows}</table>
  `;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isActiveNow(employee) {
  const today = todayStr();
  if (employee.startDate && today < employee.startDate) return false;
  return !employee.endDate || today <= employee.endDate;
}

function statusText(employee) {
  if (employee.startDate && todayStr() < employee.startDate) return `Starts ${formatShortDate(employee.startDate)}`;
  if (!isActiveNow(employee)) {
    return employee.endReason === "transferred" ? `Transferred${employee.transferredTo ? " to " + escapeHtml(employee.transferredTo) : ""}` : "Resigned";
  }
  return "Active";
}
