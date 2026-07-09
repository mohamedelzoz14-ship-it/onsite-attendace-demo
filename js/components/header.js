/**
 * header.js
 * Sets the topbar's 3-line welcome (greeting / full name / role) + date
 * subtitle, and the small "Today's Value" strip — the exact same shape for
 * all three dashboards (Employee, Store Manager, District Manager), so the
 * welcome experience is genuinely consistent rather than three separate
 * implementations that happen to look similar.
 */
import { greeting, formatLongDate } from "../utils/dateUtils.js";
import { getTodaysValue } from "../utils/todaysValue.js";
import { ROLES } from "../config/constants.js";

/** Human-readable role labels — a display-only lookup, same pattern as STATUS_DISPLAY for attendance pills. */
const ROLE_LABELS = Object.freeze({
  [ROLES.EMPLOYEE]: "Sales Associate",
  [ROLES.ADMIN]: "Store Manager",
  [ROLES.DISTRICT_MANAGER]: "District Manager"
});

/**
 * @param {object} ctx
 * @param {HTMLElement} [ctx.greetingEl] - the small "Good morning" / "Welcome back" line
 * @param {HTMLElement} [ctx.nameEl] - the large full-name line (this dashboard's <h1>)
 * @param {HTMLElement} [ctx.roleEl] - the small role label line
 * @param {HTMLElement} ctx.subEl - the date/store subtitle line
 * @param {string} ctx.fullName
 * @param {string} ctx.role - one of config/constants.js ROLES
 * @param {string} ctx.storeLabel
 * @param {string} [ctx.holidayLabel] - if today is a public holiday, appended as a small reminder
 */
export function renderWelcomeHeader({ greetingEl, nameEl, roleEl, subEl, fullName, role, storeLabel, holidayLabel }) {
  // District Manager checks in less often — a time-of-day greeting feels
  // like a genuine executive check-in. Store Manager and Employee are here
  // multiple times a day, so a fixed "Welcome back" fits the frequent,
  // day-to-day nature of those roles better than repeating "Good morning"
  // at 4pm.
  if (greetingEl) greetingEl.textContent = role === ROLES.DISTRICT_MANAGER ? greeting() : "Welcome back";
  if (nameEl) nameEl.textContent = fullName;
  if (roleEl) roleEl.textContent = ROLE_LABELS[role] || "";
  subEl.textContent = `${formatLongDate()} · ${storeLabel}${holidayLabel ? " · 🎉 " + holidayLabel : ""}`;
}

/**
 * @param {object} ctx
 * @param {HTMLElement} ctx.nameEl
 * @param {HTMLElement} ctx.bodyEl
 */
export function renderTodaysValue({ nameEl, bodyEl }) {
  const value = getTodaysValue();
  nameEl.textContent = value.name;
  bodyEl.textContent = value.body;
}
