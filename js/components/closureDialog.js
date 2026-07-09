/**
 * closureDialog.js
 * Small self-contained form for the admin to declare a full store closure
 * (power outage, weather, security lockdown). Any date is allowed — past
 * (catching up a record after the fact) or future (a planned closure, e.g.
 * renovation). Same inline-styled approach as the other dialogs.
 *
 * @returns {Promise<{date:string, reason:string} | null>}
 */
import { todayKey } from "../utils/dateUtils.js";

export function openClosureDialog() {
  return new Promise((resolve) => {
    const today = todayKey();

    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed; inset:0; background:rgba(10,10,10,0.45); display:flex; align-items:center; justify-content:center; z-index:1000;";

    const box = document.createElement("div");
    box.style.cssText =
      "background:var(--white); border-radius:var(--radius-lg); padding:28px; max-width:360px; width:90%; box-shadow:var(--shadow-lg); font-family:inherit;";

    box.innerHTML = `
      <h3 style="font-family:var(--font-display); font-size:20px; font-weight:700; margin-bottom:4px;">Declare a store closure</h3>
      <p style="font-size:13px; color:var(--gray-600); margin-bottom:16px;">Nobody will be marked absent for this date, and check-in will be blocked.</p>

      <label style="display:block; font-size:12.5px; font-weight:600; margin-bottom:6px;">Date</label>
      <input type="date" data-closure-date value="${today}" style="width:100%; padding:10px 12px; border:1px solid var(--gray-200); border-radius:var(--radius-sm); font-size:14px; margin-bottom:14px; font-family:inherit;">

      <label style="display:block; font-size:12.5px; font-weight:600; margin-bottom:6px;">Reason</label>
      <input type="text" data-reason placeholder="e.g. Power outage" style="width:100%; padding:10px 12px; border:1px solid var(--gray-200); border-radius:var(--radius-sm); font-size:14px; margin-bottom:6px; font-family:inherit;">
      <p data-error style="display:none; font-size:12px; color:var(--red); margin-bottom:10px;">Please pick a date.</p>

      <div style="display:flex; gap:10px; margin-top:12px;">
        <button data-cancel style="flex:1; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--gray-200); background:var(--white); font-weight:600; font-size:13.5px; cursor:pointer;">Cancel</button>
        <button data-submit style="flex:1; padding:11px; border-radius:var(--radius-sm); border:none; background:var(--black); color:var(--white); font-family:var(--font-display); font-weight:700; font-size:14px; letter-spacing:0.03em; text-transform:uppercase; cursor:pointer;">Declare closure</button>
      </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function close(value) {
      document.body.removeChild(overlay);
      resolve(value);
    }

    box.querySelector("[data-cancel]").addEventListener("click", () => close(null));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });

    box.querySelector("[data-submit]").addEventListener("click", () => {
      const date = box.querySelector("[data-closure-date]").value;
      const reason = box.querySelector("[data-reason]").value.trim();
      if (!date) {
        box.querySelector("[data-error]").style.display = "block";
        return;
      }
      close({ date, reason });
    });
  });
}
