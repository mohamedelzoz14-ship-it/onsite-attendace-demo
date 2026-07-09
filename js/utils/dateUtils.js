/**
 * dateUtils.js
 * Small, pure date/time helpers. No DOM, no storage, no business rules.
 */

export function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}

/** Local date key in YYYY-MM-DD form — used as the attendance record's `date` field. */
export function todayKey(date = new Date()) {
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

export function minutesSinceMidnight(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function formatLongDate(date = new Date()) {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export function formatShortDate(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Formats an ISO timestamp as a 12-hour clock string, or an em dash if null. */
export function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

/** Formats a minutes-from-midnight value (from shiftConfig) as "9:00 AM". */
export function formatShiftMinutes(min) {
  if (min === null || min === undefined) return "—";
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return h12 + ":" + pad(m) + " " + ampm;
}

/** Formats an elapsed duration in ms as "1h 12m 04s". */
export function formatElapsed(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const s = Math.floor((ms % 60000) / 1000);
  return (h > 0 ? h + "h " : "") + m + "m " + s + "s";
}

/** @param {string} iso @returns {string} a short relative label like "2m ago", "3h ago", or a short date once it's more than a day old. */
export function formatRelativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return formatShortDate(todayKey(new Date(iso)));
}
