/**
 * notificationService.js
 * The single catalog of every user-facing message in the app, each tagged
 * with a severity. Pages never write message strings inline — they ask for
 * a code (from config/constants.js NOTIFICATION_CODES) and render whatever
 * this service returns. That means every string the app can show a person
 * lives in exactly one place.
 */
import { NOTIFICATION_CODES as CODE, NOTIFICATION_TYPES as TYPE } from "../config/constants.js";

const CATALOG = {
  [CODE.LOGIN_NOT_FOUND]: { type: TYPE.ERROR, message: "Employee ID not recognized. Try 1163 (staff) or 8000 (manager)." },
  [CODE.INVALID_EMPLOYEE]: { type: TYPE.ERROR, message: "This employee ID isn't recognized." },

  [CODE.LOCATION_UNSUPPORTED]: { type: TYPE.ERROR, message: "Location isn't supported on this device — ask your manager to check you in manually." },
  [CODE.LOCATION_DENIED]: { type: TYPE.ERROR, message: "Location access is off. Enable it in your browser settings to check in." },
  [CODE.LOCATION_CHECKING]: { type: TYPE.INFO, message: "Checking your location…" },
  [CODE.LOCATION_TOO_FAR]: { type: TYPE.ERROR, message: (p) => `You're about ${p && p.distance}m from ${(p && p.storeLabel) || "the store"}. Move closer to check in.` },
  [CODE.LOCATION_OK_WITH_QR]: { type: TYPE.SUCCESS, message: "Store QR + location verified." },
  [CODE.LOCATION_OK_NO_QR]: { type: TYPE.SUCCESS, message: "Location verified — you're at the store." },
  [CODE.QR_MISMATCH]: { type: TYPE.ERROR, message: "This QR code doesn't match your store. Scan the code at your store entrance." },
  [CODE.QR_INFO_VALID]: { type: TYPE.INFO, message: "Store QR verified — we'll confirm your location on check in." },
  [CODE.QR_INFO_INVALID]: { type: TYPE.WARNING, message: "This QR doesn't match your store." },
  [CODE.QR_INFO_NONE]: { type: TYPE.INFO, message: "We'll check your location when you check in." },

  [CODE.DAY_OFF_TODAY]: { type: TYPE.WARNING, message: "You're scheduled off today — no check-in needed." },
  [CODE.ON_APPROVED_LEAVE]: { type: TYPE.INFO, message: "You're on approved leave today — no check-in needed." },
  [CODE.STORE_CLOSED_TODAY]: { type: TYPE.WARNING, message: (p) => `The store is closed today${(p && p.reason) ? " — " + p.reason : ""}. No check-in needed.` },
  [CODE.PUBLIC_HOLIDAY_WORKING]: { type: TYPE.INFO, message: (p) => `🎉 ${(p && p.label) || "Public holiday"} today — hours you work count toward holiday pay.` },
  [CODE.NOTHING_TO_CHECK_IN]: { type: TYPE.INFO, message: "Nothing to check in for today." },
  [CODE.ALREADY_CHECKED_IN]: { type: TYPE.WARNING, message: "You're already checked in today." },
  [CODE.ALREADY_COMPLETED]: { type: TYPE.INFO, message: "Today's shift is already complete." },
  [CODE.NOT_CHECKED_IN]: { type: TYPE.WARNING, message: "You need to check in before you can check out." },
  [CODE.CHECKOUT_BEFORE_CHECKIN]: { type: TYPE.ERROR, message: "Something's off with the clock on this device — check-out time is before check-in." },
  [CODE.INVALID_SHIFT]: { type: TYPE.ERROR, message: "Your shift schedule looks invalid — ask your manager to check your roster entry." },
  [CODE.CHECK_IN_SUCCESS]: { type: TYPE.SUCCESS, message: "Checked in successfully." },
  [CODE.CHECK_IN_SUCCESS_EARLY]: { type: TYPE.SUCCESS, message: "Checked in successfully — a little early today." },
  [CODE.CHECK_IN_SUCCESS_LATE]: { type: TYPE.WARNING, message: "Checked in — you're marked late for this shift." },
  [CODE.CHECK_OUT_SUCCESS]: { type: TYPE.SUCCESS, message: "Checked out — have a good one." },
  [CODE.CHECK_OUT_SUCCESS_OVERTIME]: { type: TYPE.SUCCESS, message: (p) => `Checked out — includes ${p && p.overtimeHours} hrs overtime (pending manager confirmation).` },
  [CODE.CHECK_OUT_EARLY_AUTHORIZED]: { type: TYPE.SUCCESS, message: "Checked out — your early leave for today was approved." },
  [CODE.CHECK_OUT_EARLY_UNAUTHORIZED]: { type: TYPE.WARNING, message: "Checked out early — no approved early-leave request on file. You can submit one if needed." },

  [CODE.NO_RECORDS_HISTORY]: { type: TYPE.INFO, message: "No attendance recorded yet." },
  [CODE.NO_RECORDS_ADMIN]: { type: TYPE.INFO, message: "No records match these filters." },

  [CODE.REQUEST_SUBMITTED]: { type: TYPE.SUCCESS, message: "Request sent to your manager." },
  [CODE.REQUEST_ALREADY_PENDING]: { type: TYPE.WARNING, message: "You already have a pending request for this day." },
  [CODE.REQUEST_ALREADY_APPROVED]: { type: TYPE.WARNING, message: "You already have approved leave for this day." },
  [CODE.REQUEST_INVALID_RECORD]: { type: TYPE.ERROR, message: "This day doesn't have a missing check-out to correct." },
  [CODE.REQUEST_INVALID_TIME]: { type: TYPE.ERROR, message: "The check-out time must be after your check-in time." },
  [CODE.REQUEST_INVALID_DATE]: { type: TYPE.ERROR, message: "You can only request leave for today or a future date." },
  [CODE.REQUEST_DATE_ALREADY_RECORDED]: { type: TYPE.ERROR, message: "You already have attendance recorded for this day." },
  [CODE.REQUEST_NOT_FOUND]: { type: TYPE.ERROR, message: "This request no longer exists." },
  [CODE.REQUEST_ALREADY_REVIEWED]: { type: TYPE.WARNING, message: "This request was already reviewed." },
  [CODE.REQUEST_APPROVED]: { type: TYPE.SUCCESS, message: "Request approved." },
  [CODE.REQUEST_REJECTED]: { type: TYPE.INFO, message: "Request rejected." },
  [CODE.NO_PENDING_REQUESTS]: { type: TYPE.INFO, message: "No pending requests." },

  [CODE.EMPLOYEE_NAME_REQUIRED]: { type: TYPE.ERROR, message: "Enter a name (at least 2 characters)." },
  [CODE.EMPLOYEE_ADDED]: { type: TYPE.SUCCESS, message: "Employee added to the roster." },
  [CODE.EMPLOYEE_NOT_FOUND]: { type: TYPE.ERROR, message: "This employee no longer exists." },
  [CODE.EMPLOYEE_HAS_HISTORY]: { type: TYPE.ERROR, message: "This employee has attendance history — mark them as resigned or transferred instead of removing them." },
  [CODE.EMPLOYEE_REMOVED]: { type: TYPE.SUCCESS, message: "Employee removed from the roster." },
  [CODE.EMPLOYEE_DATE_INVALID]: { type: TYPE.ERROR, message: "Enter a valid date." },
  [CODE.EMPLOYEE_STATUS_UPDATED]: { type: TYPE.SUCCESS, message: "Employee status updated." },
  [CODE.EMPLOYEE_TRANSFERRED]: { type: TYPE.SUCCESS, message: "Employee transferred to the new store." },
  [CODE.EMPLOYEE_TRANSFER_SAME_STORE]: { type: TYPE.ERROR, message: "Pick a different store to transfer to." },
  [CODE.EMPLOYEE_INACTIVE]: { type: TYPE.ERROR, message: "This account is no longer active at this store." },

  [CODE.RECORD_NOT_FOUND]: { type: TYPE.ERROR, message: "This attendance record no longer exists." },
  [CODE.NO_OVERTIME_TO_CONFIRM]: { type: TYPE.INFO, message: "There's no overtime on this record to confirm." },
  [CODE.OVERTIME_ALREADY_CONFIRMED]: { type: TYPE.INFO, message: "This overtime was already confirmed." },
  [CODE.OVERTIME_CONFIRMED]: { type: TYPE.SUCCESS, message: "Overtime confirmed." },

  [CODE.CLOSURE_DATE_INVALID]: { type: TYPE.ERROR, message: "Enter a valid date." },
  [CODE.CLOSURE_ALREADY_EXISTS]: { type: TYPE.WARNING, message: "This date is already marked as a closure." },
  [CODE.CLOSURE_ADDED]: { type: TYPE.SUCCESS, message: "Closure recorded — nobody will be marked absent for that day." },
  [CODE.CLOSURE_NOT_FOUND]: { type: TYPE.ERROR, message: "This closure no longer exists." },
  [CODE.CLOSURE_REMOVED]: { type: TYPE.SUCCESS, message: "Closure removed." },

  [CODE.GENERIC_ERROR]: { type: TYPE.ERROR, message: "Something went wrong. Please try again." }
};

export const NotificationService = Object.freeze({
  /**
   * @param {string} code - a config/constants.js NOTIFICATION_CODES value
   * @param {object} [params] - data for codes whose message is templated (e.g. distance, overtimeHours)
   * @returns {{type:string, message:string}}
   */
  get(code, params) {
    const entry = CATALOG[code];
    if (!entry) {
      console.warn(`NotificationService: unknown code "${code}", falling back to generic error.`);
      return { type: TYPE.ERROR, message: CATALOG[CODE.GENERIC_ERROR].message };
    }
    const message = typeof entry.message === "function" ? entry.message(params) : entry.message;
    return { type: entry.type, message };
  }
});
