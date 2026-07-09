/**
 * main.js
 * App entry point. Loaded as <script type="module"> from index.html.
 * Owns view routing (login/employee/admin) and wires the three pages together.
 * No business logic lives here — see /js/services for that.
 */
import { AuthService } from "./services/authService.js";
import { AuditService } from "./services/auditService.js";
import { startLiveClock } from "./components/clock.js";
import { initSidebarNav } from "./components/sidebar.js";
import { initLoginPage } from "./pages/loginPage.js";
import { initEmployeePage } from "./pages/employeePage.js";
import { initAdminPage } from "./pages/adminPage.js";
import { initDMPage } from "./pages/dmPage.js";
import { byId, qsa, on } from "./utils/domUtils.js";

function bootstrap() {
  const views = {
    login: byId("view-login"),
    employee: byId("view-employee"),
    admin: byId("view-admin"),
    dm: byId("view-dm")
  };

  function showView(name) {
    Object.entries(views).forEach(([key, el]) => el.classList.toggle("active", key === name));
  }

  const employeePage = initEmployeePage();
  const adminPage = initAdminPage();
  const dmPage = initDMPage();

  const loginPage = initLoginPage({
    async onEmployeeLogin(user, id) {
      await employeePage.mount(user, id);
      showView("employee");
    },
    async onAdminLogin(user, id) {
      await adminPage.mount(user, id);
      showView("admin");
    },
    async onDMLogin(user, id) {
      await dmPage.mount(user, id);
      showView("dm");
    }
  });

  qsa("[data-logout]").forEach((btn) =>
    on(btn, "click", async () => {
      employeePage.unmount();
      await AuthService.logout();
      loginPage.reset();
      showView("login");
    })
  );

  startLiveClock(["liveClock", "liveClockAdmin", "liveClockDM"]);
  initSidebarNav("[data-emp-nav]");
  initSidebarNav("[data-admin-nav]");
  initSidebarNav("[data-dm-nav]");

  showView("login");
}

try {
  bootstrap();
} catch (error) {
  // A failure this early (before any page/service is reachable) can't be
  // logged through AuditService if storage itself is what's broken, so this
  // is the one place we fall back to a raw console.error + visible message.
  console.error("Onsite failed to start:", error);
  try {
    AuditService.logError("main.bootstrap", error);
  } catch (_) {
    // storage itself may be unavailable — nothing more we can safely do here
  }
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<div style="padding:24px; font-family:sans-serif; color:#B3261E;">Onsite couldn\'t start. Please refresh the page or contact your manager.</div>'
  );
}
