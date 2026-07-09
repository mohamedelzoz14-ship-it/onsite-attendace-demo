/**
 * holidays.js
 * Store-wide public holidays — unlike an individual employee's weekly day
 * off (config/shiftConfig.js WEEKLY_SCHEDULE), a holiday applies to every
 * employee at every store on the same calendar date. shiftEngine.js checks
 * this list BEFORE it checks an employee's personal schedule, so a holiday
 * always wins.
 *
 * Dates below are for 2026 (Egypt). Fixed national dates are exact.
 * Islamic dates (Eid al-Fitr, Eid al-Adha, Islamic New Year) depend on
 * moon sighting and are the government's best estimate as of this writing —
 * confirm the exact day close to each date and update this file if it shifts
 * by a day. Egypt also sometimes moves a holiday to a nearby Thursday for a
 * long weekend (e.g. Armed Forces Day was observed Oct 8, 2026 instead of
 * its usual Oct 6) — this list uses the *officially observed* date.
 */
export const PUBLIC_HOLIDAYS = Object.freeze([
  { date: "2026-01-07", label: "Coptic Christmas" },
  { date: "2026-01-25", label: "Revolution Day (Police Day)" },
  { date: "2026-03-20", label: "Eid al-Fitr", tentative: true },
  { date: "2026-03-21", label: "Eid al-Fitr (Day 2)", tentative: true },
  { date: "2026-03-22", label: "Eid al-Fitr (Day 3)", tentative: true },
  { date: "2026-04-25", label: "Sinai Liberation Day" },
  { date: "2026-05-01", label: "Labour Day" },
  { date: "2026-05-26", label: "Arafat Day", tentative: true },
  { date: "2026-05-27", label: "Eid al-Adha", tentative: true },
  { date: "2026-05-28", label: "Eid al-Adha (Day 2)", tentative: true },
  { date: "2026-05-29", label: "Eid al-Adha (Day 3)", tentative: true },
  { date: "2026-06-17", label: "Islamic New Year", tentative: true },
  { date: "2026-07-23", label: "Revolution Day (National Day)" },
  { date: "2026-10-08", label: "Armed Forces Day (observed)" }
]);
