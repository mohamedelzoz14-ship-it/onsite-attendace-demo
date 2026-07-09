/**
 * activityFeed.js
 * Turns the EXISTING audit log (AuditService.getLog(), already recorded by
 * every action in the app) into a human-readable activity feed — "Ahmed
 * checked in", "Sara's leave was approved". Purely a different presentation
 * of data that already exists; this file doesn't compute or decide anything,
 * it only formats event objects that were already written by the real
 * business logic (attendanceEngine.js, requestService.js, etc.).
 */
import { formatRelativeTime } from "../utils/dateUtils.js";

/** Event types worth showing in a manager-facing feed — LOGIN/LOGOUT/ERROR are deliberately excluded as noise. */
const FEED_EVENT_TYPES = new Set([
  "CHECK_IN",
  "CHECK_OUT",
  "REQUEST_SUBMITTED",
  "REQUEST_APPROVED",
  "REQUEST_REJECTED",
  "EMPLOYEE_ADDED",
  "EMPLOYEE_STATUS_CHANGED",
  "OVERTIME_CONFIRMED",
  "CLOSURE_ADDED",
  "CLOSURE_REMOVED"
]);

const ICONS = {
  CHECK_IN: '<path d="M20 6 9 17l-5-5"/>',
  CHECK_OUT: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  REQUEST_SUBMITTED: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  REQUEST_APPROVED: '<path d="M20 6 9 17l-5-5"/>',
  REQUEST_REJECTED: '<path d="M18 6 6 18M6 6l12 12"/>',
  EMPLOYEE_ADDED: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  EMPLOYEE_STATUS_CHANGED: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
  OVERTIME_CONFIRMED: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  CLOSURE_ADDED: '<path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>',
  CLOSURE_REMOVED: '<path d="M9 12h6"/><circle cx="12" cy="12" r="9"/>'
};

/**
 * @param {object} event - one entry from AuditService.getLog()
 * @param {Map<string,string>} nameById - employeeId -> display name, for events that only store an ID
 * @returns {{icon:string, text:string, time:string}|null} null if this event type isn't shown in the feed
 */
export function formatActivityEvent(event, nameById) {
  if (!FEED_EVENT_TYPES.has(event.eventType)) return null;

  const nameFor = (id) => nameById.get(id) || id || "Someone";
  let text;

  switch (event.eventType) {
    case "CHECK_IN":
      text = `${nameFor(event.employeeId)} checked in${event.status === "late" ? " (late)" : ""}.`;
      break;
    case "CHECK_OUT":
      text = `${nameFor(event.employeeId)} checked out — ${event.totalHours} hrs worked.`;
      break;
    case "REQUEST_SUBMITTED":
      text = `${nameFor(event.employeeId)} submitted a ${(event.type || "").replace(/_/g, " ").toLowerCase()} request.`;
      break;
    case "REQUEST_APPROVED":
      text = `${nameFor(event.reviewedBy)} approved ${nameFor(event.employeeId)}'s request.`;
      break;
    case "REQUEST_REJECTED":
      text = `${nameFor(event.reviewedBy)} rejected ${nameFor(event.employeeId)}'s request.`;
      break;
    case "EMPLOYEE_ADDED":
      text = `${nameFor(event.actingAdminId)} added ${event.name} to the roster.`;
      break;
    case "EMPLOYEE_STATUS_CHANGED":
      text = `${nameFor(event.actingAdminId)} updated ${nameFor(event.employeeId)}'s employment status.`;
      break;
    case "OVERTIME_CONFIRMED":
      text = `${nameFor(event.actingAdminId)} confirmed ${event.overtimeHours} hrs of overtime for ${nameFor(event.employeeId)}.`;
      break;
    case "CLOSURE_ADDED":
      text = `${nameFor(event.actingAdminId)} declared a store closure${event.reason ? " — " + event.reason : ""}.`;
      break;
    case "CLOSURE_REMOVED":
      text = `${nameFor(event.actingAdminId)} removed a store closure.`;
      break;
    default:
      return null;
  }

  return { icon: ICONS[event.eventType] || "", text, time: formatRelativeTime(event.timestamp) };
}

/**
 * @param {object[]} events - from AuditService.getLog()
 * @param {object[]} roster - from EmployeeService.getRoster(), used only to resolve IDs to names
 * @param {number} [limit]
 * @returns {string} rendered <li> markup for a .activity-feed <ul>
 */
export function renderActivityFeed(events, roster, limit = 12) {
  const nameById = new Map(roster.map((e) => [e.id, e.name]));

  const items = events
    .slice()
    .reverse() // getLog() returns oldest-first; feed reads newest-first
    .map((e) => formatActivityEvent(e, nameById))
    .filter(Boolean)
    .slice(0, limit);

  if (items.length === 0) {
    return `<div class="empty-state" style="padding:28px;"><div class="empty-title">No activity yet</div><div class="empty-body">Check-ins, requests, and admin actions will show up here as they happen.</div></div>`;
  }

  return `<ul class="activity-feed">
    ${items
      .map(
        (item) => `<li>
        <span class="activity-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${item.icon}</svg></span>
        <span class="activity-text">${item.text}</span>
        <span class="activity-time">${item.time}</span>
      </li>`
      )
      .join("")}
  </ul>`;
}
