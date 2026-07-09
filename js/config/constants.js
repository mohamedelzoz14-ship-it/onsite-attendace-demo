/**
 * constants.js
 * Single source of truth for every "magic string" used across the app.
 * Nothing outside /config should hardcode a status, role, shift key, or
 * notification/audit code — everything downstream reads from here.
 */

export const ROLES = Object.freeze({
  EMPLOYEE: "employee",
  ADMIN: "admin",
  DISTRICT_MANAGER: "district_manager"
});

export const ATTENDANCE_STATUS = Object.freeze({
  PRESENT: "present",
  LATE: "late",
  ABSENT: "absent",
  MISSING_CHECKOUT: "missing",
  DAY_OFF: "leave",
  ON_LEAVE: "on_leave", // approved planned/sick leave — distinct from a personal weekly day off
  STORE_CLOSED: "store_closed" // admin-declared full closure (power cut, weather, etc.)
});

export const SHIFT_TYPES = Object.freeze({
  MORNING: "morning",
  AFTERNOON: "afternoon",
  EXTENDED: "extended", // Thu/Fri shift
  OFF: "off"
});

export const STORAGE_KEYS = Object.freeze({
  ATTENDANCE_RECORDS: "onsite_attendance_records_v1",
  AUDIT_LOG: "onsite_audit_log_v1",
  REQUESTS: "onsite_requests_v1",
  ROSTER: "onsite_roster_v1",
  CLOSURES: "onsite_closures_v1"
});

// Status -> { pillClass, label } used by the badge/pill component.
// pillClass must match a .pill.<class> rule in css/employee.css / admin.css.
export const STATUS_DISPLAY = Object.freeze({
  [ATTENDANCE_STATUS.PRESENT]:          { pillClass: "present", label: "Present" },
  [ATTENDANCE_STATUS.LATE]:             { pillClass: "late",    label: "Late" },
  [ATTENDANCE_STATUS.ABSENT]:           { pillClass: "absent",  label: "Absent" },
  [ATTENDANCE_STATUS.MISSING_CHECKOUT]: { pillClass: "absent",  label: "Missing check-out" },
  [ATTENDANCE_STATUS.DAY_OFF]:          { pillClass: "leave",   label: "Day off" },
  [ATTENDANCE_STATUS.ON_LEAVE]:         { pillClass: "leave",   label: "On leave" },
  [ATTENDANCE_STATUS.STORE_CLOSED]:     { pillClass: "leave",   label: "Store closed" }
});

/** Every event the Audit Log system is able to record. See services/auditService.js. */
export const AUDIT_EVENTS = Object.freeze({
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  CHECK_IN: "CHECK_IN",
  CHECK_OUT: "CHECK_OUT",
  ATTENDANCE_EDIT: "ATTENDANCE_EDIT",
  REQUEST_SUBMITTED: "REQUEST_SUBMITTED",
  REQUEST_APPROVED: "REQUEST_APPROVED",
  REQUEST_REJECTED: "REQUEST_REJECTED",
  EMPLOYEE_ADDED: "EMPLOYEE_ADDED",
  EMPLOYEE_REMOVED: "EMPLOYEE_REMOVED",
  EMPLOYEE_STATUS_CHANGED: "EMPLOYEE_STATUS_CHANGED",
  OVERTIME_CONFIRMED: "OVERTIME_CONFIRMED",
  CLOSURE_ADDED: "CLOSURE_ADDED",
  CLOSURE_REMOVED: "CLOSURE_REMOVED",
  ERROR: "ERROR"
});

/**
 * Every kind of employee → manager request the app supports. Only
 * MISSED_CHECKOUT_CORRECTION is wired to a real flow today — the others are
 * named here so requestService.js's shared plumbing (submit/approve/reject,
 * one Pending Requests list) is ready to grow into them without a rewrite.
 * See docs/BUSINESS_RULES.md → "Request system" for the phased plan.
 */
export const REQUEST_TYPES = Object.freeze({
  MISSED_CHECKOUT_CORRECTION: "MISSED_CHECKOUT_CORRECTION",
  EARLY_LEAVE: "EARLY_LEAVE",
  PLANNED_LEAVE: "PLANNED_LEAVE",
  SICK_LEAVE: "SICK_LEAVE"
});

export const REQUEST_STATUS = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected"
});

/** Human-readable labels for REQUEST_TYPES, used in the admin's Pending Requests table. */
export const REQUEST_TYPE_LABELS = Object.freeze({
  [REQUEST_TYPES.MISSED_CHECKOUT_CORRECTION]: "Missed check-out",
  [REQUEST_TYPES.EARLY_LEAVE]: "Early leave",
  [REQUEST_TYPES.PLANNED_LEAVE]: "Planned leave",
  [REQUEST_TYPES.SICK_LEAVE]: "Sick leave"
});

/** Severity levels the Notification Service can return. Maps to banner visuals in pages. */
export const NOTIFICATION_TYPES = Object.freeze({
  SUCCESS: "success",
  WARNING: "warning",
  ERROR: "error",
  INFO: "info"
});

/**
 * Every notification/validation *code* the app can raise. The actual copy for
 * each code lives in services/notificationService.js — this enum exists so
 * every layer (rules, validation, engines, pages) refers to the same
 * vocabulary instead of comparing raw strings.
 */
/** Employment lifecycle state on this store's roster — distinct from ATTENDANCE_STATUS (which is per-day). */
export const EMPLOYEE_STATUS = Object.freeze({
  ACTIVE: "active",
  RESIGNED: "resigned",
  TRANSFERRED: "transferred"
});

export const NOTIFICATION_CODES = Object.freeze({
  // Auth
  LOGIN_NOT_FOUND: "LOGIN_NOT_FOUND",
  INVALID_EMPLOYEE: "INVALID_EMPLOYEE",

  // Location / QR
  LOCATION_UNSUPPORTED: "LOCATION_UNSUPPORTED",
  LOCATION_DENIED: "LOCATION_DENIED",
  LOCATION_CHECKING: "LOCATION_CHECKING",
  LOCATION_TOO_FAR: "LOCATION_TOO_FAR",
  LOCATION_OK_WITH_QR: "LOCATION_OK_WITH_QR",
  LOCATION_OK_NO_QR: "LOCATION_OK_NO_QR",
  QR_MISMATCH: "QR_MISMATCH",
  QR_INFO_VALID: "QR_INFO_VALID",
  QR_INFO_INVALID: "QR_INFO_INVALID",
  QR_INFO_NONE: "QR_INFO_NONE",

  // Attendance validation
  DAY_OFF_TODAY: "DAY_OFF_TODAY",
  ON_APPROVED_LEAVE: "ON_APPROVED_LEAVE",
  STORE_CLOSED_TODAY: "STORE_CLOSED_TODAY",
  PUBLIC_HOLIDAY_WORKING: "PUBLIC_HOLIDAY_WORKING",
  NOTHING_TO_CHECK_IN: "NOTHING_TO_CHECK_IN",
  ALREADY_CHECKED_IN: "ALREADY_CHECKED_IN",
  ALREADY_COMPLETED: "ALREADY_COMPLETED",
  NOT_CHECKED_IN: "NOT_CHECKED_IN",
  CHECKOUT_BEFORE_CHECKIN: "CHECKOUT_BEFORE_CHECKIN",
  INVALID_SHIFT: "INVALID_SHIFT",
  CHECK_IN_SUCCESS: "CHECK_IN_SUCCESS",
  CHECK_IN_SUCCESS_EARLY: "CHECK_IN_SUCCESS_EARLY",
  CHECK_IN_SUCCESS_LATE: "CHECK_IN_SUCCESS_LATE",
  CHECK_OUT_SUCCESS: "CHECK_OUT_SUCCESS",
  CHECK_OUT_SUCCESS_OVERTIME: "CHECK_OUT_SUCCESS_OVERTIME",
  CHECK_OUT_EARLY_AUTHORIZED: "CHECK_OUT_EARLY_AUTHORIZED",
  CHECK_OUT_EARLY_UNAUTHORIZED: "CHECK_OUT_EARLY_UNAUTHORIZED",

  // Tables / lists
  NO_RECORDS_HISTORY: "NO_RECORDS_HISTORY",
  NO_RECORDS_ADMIN: "NO_RECORDS_ADMIN",

  // Employee lifecycle
  EMPLOYEE_NAME_REQUIRED: "EMPLOYEE_NAME_REQUIRED",
  EMPLOYEE_ADDED: "EMPLOYEE_ADDED",
  EMPLOYEE_NOT_FOUND: "EMPLOYEE_NOT_FOUND",
  EMPLOYEE_HAS_HISTORY: "EMPLOYEE_HAS_HISTORY",
  EMPLOYEE_REMOVED: "EMPLOYEE_REMOVED",
  EMPLOYEE_DATE_INVALID: "EMPLOYEE_DATE_INVALID",
  EMPLOYEE_STATUS_UPDATED: "EMPLOYEE_STATUS_UPDATED",
  EMPLOYEE_INACTIVE: "EMPLOYEE_INACTIVE",
  EMPLOYEE_TRANSFERRED: "EMPLOYEE_TRANSFERRED",
  EMPLOYEE_TRANSFER_SAME_STORE: "EMPLOYEE_TRANSFER_SAME_STORE",

  // Overtime confirmation
  RECORD_NOT_FOUND: "RECORD_NOT_FOUND",
  NO_OVERTIME_TO_CONFIRM: "NO_OVERTIME_TO_CONFIRM",
  OVERTIME_ALREADY_CONFIRMED: "OVERTIME_ALREADY_CONFIRMED",
  OVERTIME_CONFIRMED: "OVERTIME_CONFIRMED",

  // Store closures
  CLOSURE_DATE_INVALID: "CLOSURE_DATE_INVALID",
  CLOSURE_ALREADY_EXISTS: "CLOSURE_ALREADY_EXISTS",
  CLOSURE_ADDED: "CLOSURE_ADDED",
  CLOSURE_NOT_FOUND: "CLOSURE_NOT_FOUND",
  CLOSURE_REMOVED: "CLOSURE_REMOVED",

  // Requests (missed-checkout correction and future request types)
  REQUEST_SUBMITTED: "REQUEST_SUBMITTED",
  REQUEST_ALREADY_PENDING: "REQUEST_ALREADY_PENDING",
  REQUEST_ALREADY_APPROVED: "REQUEST_ALREADY_APPROVED",
  REQUEST_INVALID_RECORD: "REQUEST_INVALID_RECORD",
  REQUEST_INVALID_TIME: "REQUEST_INVALID_TIME",
  REQUEST_INVALID_DATE: "REQUEST_INVALID_DATE",
  REQUEST_DATE_ALREADY_RECORDED: "REQUEST_DATE_ALREADY_RECORDED",
  REQUEST_NOT_FOUND: "REQUEST_NOT_FOUND",
  REQUEST_ALREADY_REVIEWED: "REQUEST_ALREADY_REVIEWED",
  REQUEST_APPROVED: "REQUEST_APPROVED",
  REQUEST_REJECTED: "REQUEST_REJECTED",
  NO_PENDING_REQUESTS: "NO_PENDING_REQUESTS",

  // Fallback
  GENERIC_ERROR: "GENERIC_ERROR"
});
