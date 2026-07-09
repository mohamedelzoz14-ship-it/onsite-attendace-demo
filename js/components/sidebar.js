/**
 * sidebar.js
 * Wires the active/inactive state for sidebar nav buttons. Shared by the
 * employee and admin sidebars, which both use [data-nav] buttons grouped
 * inside a `.nav-group`.
 */

export function initSidebarNav(navSelector) {
  document.querySelectorAll(navSelector).forEach((btn) => {
    btn.addEventListener("click", () => {
      const group = btn.closest(".nav-group");
      group.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}
