/**
 * badge.js
 * Renders the small colored "pill" used for attendance status everywhere
 * (employee history table, admin table, status badge on the check-in card).
 */
import { STATUS_DISPLAY } from "../config/constants.js";

/** Returns the pill's HTML markup for a given status key. */
export function pillHtml(status) {
  const display = STATUS_DISPLAY[status] || { pillClass: "leave", label: status };
  return `<span class="pill ${display.pillClass}"><span class="dot"></span>${display.label}</span>`;
}

/** Returns { pillClass, label } for cases that need the raw values instead of markup. */
export function statusDisplay(status) {
  return STATUS_DISPLAY[status] || { pillClass: "leave", label: status };
}
