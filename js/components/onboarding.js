/**
 * onboarding.js
 * A brief, one-time welcome shown the first time each role loads Onsite in a
 * browser — purely a client-side UI touch (tracked in that browser's own
 * localStorage, never sent anywhere), explaining what that role's dashboard
 * is for. Shown once per role, never again on that device unless storage is
 * cleared — a separate key per role means testing different logins in the
 * same browser doesn't skip a role's onboarding it hasn't seen yet.
 */
const CONTENT_BY_ROLE = {
  employee: {
    icon: '<path d="M20 6 9 17l-5-5"/>',
    body: "One tap to check in when your shift starts, one tap to check out when it ends. Your location is checked automatically — no need to do anything else."
  },
  admin: {
    icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    body: "See who's on shift, review requests, and manage your team — all from one screen. Everything updates live as your team checks in."
  },
  district_manager: {
    icon: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
    body: "A live view across every store — attendance trends, store comparisons, and operational insights, updated in real time."
  }
};

/**
 * @param {string} role - one of config/constants.js ROLES
 * @param {string} firstName
 * @returns {boolean} true if the welcome was actually shown (first time for this role on this device)
 */
export function maybeShowOnboarding(role, firstName) {
  const storageKey = `onsite_onboarding_seen_${role}_v1`;
  if (localStorage.getItem(storageKey)) return false;

  const content = CONTENT_BY_ROLE[role] || CONTENT_BY_ROLE.employee;

  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed; inset:0; background:rgba(10,10,10,0.6); display:flex; align-items:center; justify-content:center; z-index:1100; padding:20px;";

  const box = document.createElement("div");
  box.style.cssText =
    "background:var(--white); border-radius:var(--radius-lg); padding:32px 28px; max-width:360px; width:100%; box-shadow:var(--shadow-lg); text-align:center;";
  box.innerHTML = `
    <div style="width:48px; height:48px; border-radius:50%; background:var(--black); display:flex; align-items:center; justify-content:center; margin:0 auto 18px auto;">
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--white)" stroke-width="2" style="width:22px; height:22px;">${content.icon}</svg>
    </div>
    <h3 style="font-family:var(--font-display); font-size:21px; font-weight:700; margin-bottom:8px;">Welcome to Onsite, ${firstName}</h3>
    <p style="font-size:13.5px; color:var(--gray-600); line-height:1.6; margin-bottom:22px;">${content.body}</p>
    <button data-dismiss style="width:100%; padding:12px; border-radius:var(--radius-sm); border:none; background:var(--black); color:var(--white); font-family:var(--font-display); font-weight:700; font-size:14px; letter-spacing:0.03em; text-transform:uppercase; cursor:pointer;">Got it</button>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  function close() {
    localStorage.setItem(storageKey, "1");
    document.body.removeChild(overlay);
  }
  box.querySelector("[data-dismiss]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  return true;
}
