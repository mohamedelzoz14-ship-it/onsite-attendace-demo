/**
 * requestDialog.js
 * Small self-contained form dialog for submitting a missed-checkout
 * correction. Same inline-styled approach as dialog.js (uses the app's CSS
 * variables directly) so no new CSS file is needed.
 *
 * @param {{dateLabel:string, checkInLabel:string}} ctx
 * @returns {Promise<{checkOutTime:string, reason:string} | null>} resolves
 * to the form values, or null if the person cancelled.
 */
export function openCorrectionDialog({ dateLabel, checkInLabel }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed; inset:0; background:rgba(10,10,10,0.45); display:flex; align-items:center; justify-content:center; z-index:1000;";

    const box = document.createElement("div");
    box.style.cssText =
      "background:var(--white); border-radius:var(--radius-lg); padding:28px; max-width:360px; width:90%; box-shadow:var(--shadow-lg); font-family:inherit;";

    box.innerHTML = `
      <h3 style="font-family:var(--font-display); font-size:20px; font-weight:700; margin-bottom:4px;">Request a correction</h3>
      <p style="font-size:13px; color:var(--gray-600); margin-bottom:18px;">
        For <strong style="color:var(--black);">${dateLabel}</strong> — checked in at ${checkInLabel}, no check-out recorded.
      </p>

      <label style="display:block; font-size:12.5px; font-weight:600; margin-bottom:6px;">What time did you actually leave?</label>
      <input type="time" data-checkout-time style="width:100%; padding:10px 12px; border:1px solid var(--gray-200); border-radius:var(--radius-sm); font-size:14px; margin-bottom:14px; font-family:inherit;">

      <label style="display:block; font-size:12.5px; font-weight:600; margin-bottom:6px;">Note for your manager</label>
      <textarea data-reason rows="3" placeholder="e.g. Forgot to tap out before rushing off" style="width:100%; padding:10px 12px; border:1px solid var(--gray-200); border-radius:var(--radius-sm); font-size:13.5px; font-family:inherit; resize:vertical; margin-bottom:6px;"></textarea>
      <p data-error style="display:none; font-size:12px; color:var(--red); margin-bottom:10px;">Please enter the time you left.</p>

      <div style="display:flex; gap:10px; margin-top:12px;">
        <button data-cancel style="flex:1; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--gray-200); background:var(--white); font-weight:600; font-size:13.5px; cursor:pointer;">Cancel</button>
        <button data-submit style="flex:1; padding:11px; border-radius:var(--radius-sm); border:none; background:var(--black); color:var(--white); font-family:var(--font-display); font-weight:700; font-size:14px; letter-spacing:0.03em; text-transform:uppercase; cursor:pointer;">Send request</button>
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
      const checkOutTime = box.querySelector("[data-checkout-time]").value;
      const reason = box.querySelector("[data-reason]").value.trim();
      if (!checkOutTime) {
        box.querySelector("[data-error]").style.display = "block";
        return;
      }
      close({ checkOutTime, reason });
    });
  });
}
