/**
 * loginPage.js
 * Wires the login form. Delegates all "is this a real user" logic to
 * AuthService — this file only touches the DOM and decides which page to show next.
 */
import { AuthService } from "../services/authService.js";
import { AttendanceEngine } from "../services/attendanceEngine.js";
import { NotificationService } from "../services/notificationService.js";
import { AuditService } from "../services/auditService.js";
import { ROLES, NOTIFICATION_CODES as CODE } from "../config/constants.js";
import { createBanner } from "../components/notifications.js";
import { byId, on } from "../utils/domUtils.js";

export function initLoginPage({ onEmployeeLogin, onAdminLogin, onDMLogin }) {
  const form = byId("loginForm");
  const errorEl = byId("loginError");
  const errorBanner = createBanner(errorEl, errorEl, "login-error");

  on(form, "submit", async (e) => {
    e.preventDefault();
    try {
      const id = byId("empId").value.trim();
      const user = await AuthService.login(id);

      if (!user) {
        errorEl.textContent = NotificationService.get(CODE.LOGIN_NOT_FOUND).message;
        errorBanner.show();
        return;
      }
      errorBanner.hide();

      // Missing check-outs from previous days are detected once per sign-in,
      // regardless of who logs in — see attendanceEngine.js.
      await AttendanceEngine.detectMissingCheckouts();

      if (user.role === ROLES.ADMIN) {
        await onAdminLogin(user, id);
      } else if (user.role === ROLES.DISTRICT_MANAGER) {
        await onDMLogin(user, id);
      } else {
        await onEmployeeLogin(user, id);
      }
    } catch (error) {
      await AuditService.logError("loginPage.submit", error);
      errorEl.textContent = NotificationService.get(CODE.GENERIC_ERROR).message;
      errorBanner.show();
    }
  });

  on(byId("msBtn"), "click", () => {
    byId("empId").value = "1163";
    byId("empPass").value = "microsoft-sso";
    form.requestSubmit();
  });

  return {
    reset() {
      form.reset();
      errorBanner.hide();
    }
  };
}
