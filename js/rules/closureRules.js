/**
 * closureRules.js
 * Pure rules about admin-declared store closures (power outage, weather,
 * security lockdown, etc.) — distinct from a public holiday, which never
 * blocks anything. A closure means the store genuinely couldn't operate, so
 * it DOES exclude anyone without an existing record and DOES block check-in.
 * Same contract as the other /rules files: plain data in, plain out.
 */

/** @param {string} dateStr @returns {boolean} true if `dateStr` is a well-formed, parseable YYYY-MM-DD date. */
export function isValidClosureDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  return !Number.isNaN(new Date(dateStr).getTime());
}

/**
 * @param {string} dateKey - YYYY-MM-DD
 * @param {{date:string}[]} closures
 * @returns {object|null} the matching closure, or null if `dateKey` isn't one.
 */
export function findClosure(dateKey, closures) {
  return closures.find((c) => c.date === dateKey) || null;
}
