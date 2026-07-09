/**
 * shiftConfig.js
 * The ONLY place shift times and the weekly schedule are defined.
 * shiftEngine.js reads from here — it never hardcodes a time itself.
 * Store locations live separately in config/stores.js.
 *
 * In production, WEEKLY_SCHEDULE would be fetched from the roster / Excel
 * source instead of being hardcoded — see README "Future Backend Plan".
 */
import { SHIFT_TYPES } from "./constants.js";

// Start/end are minutes-from-midnight. `end` can exceed 24*60 (e.g. a shift past midnight).
export const SHIFTS = Object.freeze({
  [SHIFT_TYPES.MORNING]:   { label: "Morning",             start: 9 * 60,  end: 18 * 60 }, // 9:00 AM – 6:00 PM
  [SHIFT_TYPES.AFTERNOON]: { label: "Afternoon",           start: 14 * 60, end: 23 * 60 }, // 2:00 PM – 11:00 PM
  [SHIFT_TYPES.EXTENDED]:  { label: "Extended (Thu/Fri)",  start: 15 * 60, end: 24 * 60 }, // 3:00 PM – 12:00 AM
  [SHIFT_TYPES.OFF]:       { label: "Day off",             start: null,    end: null }
});

export const SHIFT_RULES = Object.freeze({
  lateGraceMinutes: 5, // minutes past shift start before status becomes "late"
  latenessAlertThreshold: 3 // late arrivals within the current month before the admin dashboard flags a pattern
});

// Weekly schedule per employee — index 0 = Sunday ... 6 = Saturday.
// ShiftEngine reads EXCLUSIVELY from this object — the weekly_schedules
// Supabase table exists for future use but isn't consumed by the app yet
// (see docs/ARCHITECTURE.md → "Shift Engine"), so every real employee
// needs an entry HERE for shift-based features to actually work for them.
//
// The 43 new employees below use 4 rotating placeholder templates (each
// with exactly one day off, staggered so a whole store isn't off the same
// day) — the master data sheet doesn't specify real shift assignments yet;
// update these once it does. Same rotation as
// onsite-supabase/08_real_data_migration.sql, so the JS config (what the
// app actually uses) and the DB table (kept for future-readiness) agree.
export const WEEKLY_SCHEDULE = Object.freeze({
  "1163": ["morning", "morning", "afternoon", "afternoon", "extended", "extended", "morning"],
  "1002": ["afternoon", "off", "morning", "morning", "extended", "extended", "morning"],
  "1003": ["morning", "afternoon", "off", "morning", "extended", "extended", "afternoon"],
  "1004": ["off", "morning", "morning", "afternoon", "extended", "extended", "off"],
  "1005": ["afternoon", "morning", "afternoon", "off", "extended", "extended", "afternoon"],

  // EG222 · Miami
  "225":  ["off", "morning", "morning", "afternoon", "extended", "extended", "morning"],
  "641":  ["morning", "off", "afternoon", "morning", "extended", "extended", "afternoon"],
  "793":  ["morning", "afternoon", "off", "morning", "extended", "extended", "morning"],
  "851":  ["afternoon", "morning", "morning", "off", "extended", "extended", "afternoon"],
  "1155": ["off", "morning", "morning", "afternoon", "extended", "extended", "morning"],
  "1210": ["morning", "off", "afternoon", "morning", "extended", "extended", "afternoon"],
  "1257": ["morning", "afternoon", "off", "morning", "extended", "extended", "morning"],
  "1259": ["afternoon", "morning", "morning", "off", "extended", "extended", "afternoon"],
  "EG222-TEMP-01": ["off", "morning", "morning", "afternoon", "extended", "extended", "morning"],

  // EG107 · San Stefano
  "EG107-TEMP-01": ["off", "morning", "morning", "afternoon", "extended", "extended", "morning"],
  "EG107-TEMP-02": ["morning", "off", "afternoon", "morning", "extended", "extended", "afternoon"],
  "EG107-TEMP-03": ["morning", "afternoon", "off", "morning", "extended", "extended", "morning"],
  "EG107-TEMP-04": ["afternoon", "morning", "morning", "off", "extended", "extended", "afternoon"],
  "EG107-TEMP-05": ["off", "morning", "morning", "afternoon", "extended", "extended", "morning"],
  "EG107-TEMP-06": ["morning", "off", "afternoon", "morning", "extended", "extended", "afternoon"],

  // EG127 · (mall — location pending)
  "EG127-TEMP-01": ["off", "morning", "morning", "afternoon", "extended", "extended", "morning"],
  "EG127-TEMP-02": ["morning", "off", "afternoon", "morning", "extended", "extended", "afternoon"],
  "EG127-TEMP-03": ["morning", "afternoon", "off", "morning", "extended", "extended", "morning"],
  "EG127-TEMP-04": ["afternoon", "morning", "morning", "off", "extended", "extended", "afternoon"],
  "EG127-TEMP-05": ["off", "morning", "morning", "afternoon", "extended", "extended", "morning"],
  "EG127-TEMP-06": ["morning", "off", "afternoon", "morning", "extended", "extended", "afternoon"],
  "EG127-TEMP-07": ["morning", "afternoon", "off", "morning", "extended", "extended", "morning"],
  "EG127-TEMP-08": ["afternoon", "morning", "morning", "off", "extended", "extended", "afternoon"],
  "EG127-TEMP-09": ["off", "morning", "morning", "afternoon", "extended", "extended", "morning"],

  // EG215 · (mall — location pending)
  "EG215-TEMP-01": ["off", "morning", "morning", "afternoon", "extended", "extended", "morning"],
  "EG215-TEMP-02": ["morning", "off", "afternoon", "morning", "extended", "extended", "afternoon"],
  "EG215-TEMP-03": ["morning", "afternoon", "off", "morning", "extended", "extended", "morning"],
  "EG215-TEMP-04": ["afternoon", "morning", "morning", "off", "extended", "extended", "afternoon"],
  "EG215-TEMP-05": ["off", "morning", "morning", "afternoon", "extended", "extended", "morning"],
  "EG215-TEMP-06": ["morning", "off", "afternoon", "morning", "extended", "extended", "afternoon"],

  // EG212 · Smouha
  "EG212-TEMP-01": ["off", "morning", "morning", "afternoon", "extended", "extended", "morning"],
  "EG212-TEMP-02": ["morning", "off", "afternoon", "morning", "extended", "extended", "afternoon"],
  "EG212-TEMP-03": ["morning", "afternoon", "off", "morning", "extended", "extended", "morning"],
  "EG212-TEMP-04": ["afternoon", "morning", "morning", "off", "extended", "extended", "afternoon"],
  "EG212-TEMP-05": ["off", "morning", "morning", "afternoon", "extended", "extended", "morning"],
  "EG212-TEMP-06": ["morning", "off", "afternoon", "morning", "extended", "extended", "afternoon"],
  "EG212-TEMP-07": ["morning", "afternoon", "off", "morning", "extended", "extended", "morning"],
  "EG212-TEMP-08": ["afternoon", "morning", "morning", "off", "extended", "extended", "afternoon"],
  "EG212-TEMP-09": ["off", "morning", "morning", "afternoon", "extended", "extended", "morning"],
  "EG212-TEMP-10": ["morning", "off", "afternoon", "morning", "extended", "extended", "afternoon"],
  "EG212-TEMP-11": ["morning", "afternoon", "off", "morning", "extended", "extended", "morning"],
  "EG212-TEMP-12": ["afternoon", "morning", "morning", "off", "extended", "extended", "afternoon"],
  "EG212-TEMP-13": ["off", "morning", "morning", "afternoon", "extended", "extended", "morning"]
});
