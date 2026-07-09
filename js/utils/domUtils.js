/**
 * domUtils.js
 * Tiny DOM helpers shared by pages/components. Keeps page files readable.
 */

export function byId(id) {
  return document.getElementById(id);
}

export function qs(selector, scope = document) {
  return scope.querySelector(selector);
}

export function qsa(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
}

export function on(element, event, handler) {
  element.addEventListener(event, handler);
}

/**
 * Escapes HTML special characters. Required before inserting any
 * user-submitted free text (e.g. a request's `reason` field) into a
 * template string that gets set via innerHTML.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return "";
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(str).replace(/[&<>"']/g, (c) => map[c]);
}
