/**
 * todaysValue.js
 * Picks one workplace value to feature per day — purely a display touch,
 * not tied to any business rule, request, or attendance data. Deterministic
 * (same day always shows the same value, everyone sees the same one that
 * day) so it doesn't need any storage: just today's date, mapped to an index.
 */
const VALUES = [
  { name: "Teamwork", body: "We're stronger on the floor when we work as one team." },
  { name: "Respect", body: "Every teammate and every customer deserves to be treated with respect." },
  { name: "Integrity", body: "Do the right thing, especially when no one's watching." },
  { name: "Courage", body: "Speak up, try new things, and own your mistakes." },
  { name: "Innovation", body: "Look for a better way to do things, even the small ones." },
  { name: "Ownership", body: "Treat the store's success like it's yours — because it is." }
];

/** @param {Date} [date] @returns {{name:string, body:string}} today's featured value. */
export function getTodaysValue(date = new Date()) {
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date - startOfYear) / 86400000);
  return VALUES[dayOfYear % VALUES.length];
}
