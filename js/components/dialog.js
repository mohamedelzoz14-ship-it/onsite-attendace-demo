/**
 * dialog.js
 * Generic confirm dialog, self-contained (inline-styled with the app's CSS
 * variables) so it doesn't require adding new CSS files. Not wired into any
 * flow today — the brief was "don't change the UI" — but the app now has a
 * reusable way to ask "are you sure?" for things like logout confirmation
 * or destructive admin actions later.
 *
 * Usage:
 *   import { confirmDialog } from "./components/dialog.js";
 *   const yes = await confirmDialog("Sign out?", "You'll need your Employee ID to sign back in.");
 */

export function confirmDialog(title, message, confirmLabel = "Confirm", cancelLabel = "Cancel") {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed; inset:0; background:rgba(10,10,10,0.45); display:flex; align-items:center; justify-content:center; z-index:1000;";

    const box = document.createElement("div");
    box.style.cssText =
      "background:var(--white); border-radius:var(--radius-lg); padding:28px; max-width:340px; width:90%; box-shadow:var(--shadow-lg); font-family:inherit;";
    box.innerHTML = `
      <h3 style="font-family:var(--font-display); font-size:20px; font-weight:700; margin-bottom:8px;">${title}</h3>
      <p style="font-size:13.5px; color:var(--gray-600); margin-bottom:20px; line-height:1.5;">${message}</p>
      <div style="display:flex; gap:10px;">
        <button data-cancel style="flex:1; padding:11px; border-radius:var(--radius-sm); border:1px solid var(--gray-200); background:var(--white); font-weight:600; font-size:13.5px; cursor:pointer;">${cancelLabel}</button>
        <button data-confirm style="flex:1; padding:11px; border-radius:var(--radius-sm); border:none; background:var(--black); color:var(--white); font-family:var(--font-display); font-weight:700; font-size:14px; letter-spacing:0.03em; text-transform:uppercase; cursor:pointer;">${confirmLabel}</button>
      </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function close(result) {
      document.body.removeChild(overlay);
      resolve(result);
    }

    box.querySelector("[data-confirm]").addEventListener("click", () => close(true));
    box.querySelector("[data-cancel]").addEventListener("click", () => close(false));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
  });
}
