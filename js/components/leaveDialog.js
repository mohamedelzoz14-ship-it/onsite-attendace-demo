/**
 * leaveDialog.js
 * Small self-contained form dialog for requesting time off — planned (a
 * future or today's date), sick (any date, including past — often reported
 * after the fact), or early leave (leaving before the shift ends, either
 * asked ahead of time or justified after already leaving). Same
 * inline-styled approach as the other dialogs — no new CSS file needed.
 *
 * @returns {Promise<{date:string, reason:string, type:"planned"|"sick"|"early", expectedTime?:string} | null>}
 * resolves to the form values, or null if the person cancelled.
 */
import { todayKey } from "../utils/dateUtils.js";

export function openLeaveDialog() {
  return new Promise((resolve) => {
    const today = todayKey();

    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed; inset:0; background:rgba(10,10,10,0.45); display:flex; align-items:center; justify-content:center; z-index:1000;";

    const box = document.createElement("div");
    box.style.cssText =
      "background:var(--white); border-radius:var(--radius-lg); padding:28px; max-width:360px; width:90%; box-shadow:var(--shadow-lg); font-family:inherit;";

    box.innerHTML = `
      <h3 style="font-family:var(--font-display); font-size:20px; font-weight:700; margin-bottom:4px;">Request time off</h3>
      <p style="font-size:13px; color:var(--gray-600); margin-bottom:16px;">You'll get a notice once your manager reviews it.</p>

      <label style="display:block; font-size:12.5px; font-weight:600; margin-bottom:6px;">Type</label>
      <div style="display:flex; gap:6px; margin-bottom:14px;">
        <button type="button" data-type="planned" style="flex:1; padding:8px 4px; border-radius:var(--radius-sm); border:1px solid var(--black); background:var(--black); color:var(--white); font-weight:600; font-size:12px; cursor:pointer;">Planned</button>
        <button type="button" data-type="sick" style="flex:1; padding:8px 4px; border-radius:var(--radius-sm); border:1px solid var(--gray-200); background:var(--white); color:var(--gray-800); font-weight:600; font-size:12px; cursor:pointer;">Sick</button>
        <button type="button" data-type="early" style="flex:1; padding:8px 4px; border-radius:var(--radius-sm); border:1px solid var(--gray-200); background:var(--white); color:var(--gray-800); font-weight:600; font-size:12px; cursor:pointer;">Early leave</button>
      </div>

      <label style="display:block; font-size:12.5px; font-weight:600; margin-bottom:6px;">Which day?</label>
      <input type="date" data-leave-date min="${today}" value="${today}" style="width:100%; padding:10px 12px; border:1px solid var(--gray-200); border-radius:var(--radius-sm); font-size:14px; margin-bottom:6px; font-family:inherit;">
      <p data-date-hint style="display:none; font-size:11.5px; color:var(--gray-500); margin-bottom:8px;">Can be reported for a past day too.</p>

      <div data-time-field style="display:none; margin-top:8px;">
        <label style="display:block; font-size:12.5px; font-weight:600; margin-bottom:6px;">About what time will you leave? (optional)</label>
        <input type="time" data-expected-time style="width:100%; padding:10px 12px; border:1px solid var(--gray-200); border-radius:var(--radius-sm); font-size:14px; margin-bottom:6px; font-family:inherit;">
      </div>

      <label style="display:block; font-size:12.5px; font-weight:600; margin-bottom:6px; margin-top:8px;">Reason</label>
      <textarea data-reason rows="3" placeholder="e.g. Family occasion" style="width:100%; padding:10px 12px; border:1px solid var(--gray-200); border-radius:var(--radius-sm); font-size:13.5px; font-family:inherit; resize:vertical; margin-bottom:6px;"></textarea>
      <p data-error style="display:none; font-size:12px; color:var(--red); margin-bottom:10px;">Please pick a date.</p>

      <div style="display:flex; gap:10px; margin-top:12px;">
        <button data-cancel style="flex:1; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--gray-200); background:var(--white); font-weight:600; font-size:13.5px; cursor:pointer;">Cancel</button>
        <button data-submit style="flex:1; padding:11px; border-radius:var(--radius-sm); border:none; background:var(--black); color:var(--white); font-family:var(--font-display); font-weight:700; font-size:14px; letter-spacing:0.03em; text-transform:uppercase; cursor:pointer;">Send request</button>
      </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    let selectedType = "planned";
    const typeButtons = {
      planned: box.querySelector('[data-type="planned"]'),
      sick: box.querySelector('[data-type="sick"]'),
      early: box.querySelector('[data-type="early"]')
    };
    const dateInput = box.querySelector("[data-leave-date]");
    const dateHint = box.querySelector("[data-date-hint]");
    const timeField = box.querySelector("[data-time-field]");

    function selectType(type) {
      selectedType = type;
      Object.entries(typeButtons).forEach(([key, btn]) => {
        const active = key === type;
        btn.style.background = active ? "var(--black)" : "var(--white)";
        btn.style.color = active ? "var(--white)" : "var(--gray-800)";
        btn.style.borderColor = active ? "var(--black)" : "var(--gray-200)";
      });

      // Planned leave must be today or later; sick/early leave can be backdated
      // (both are commonly reported after the fact).
      if (type === "planned") {
        dateInput.setAttribute("min", today);
        if (dateInput.value < today) dateInput.value = today;
        dateHint.style.display = "none";
      } else {
        dateInput.removeAttribute("min");
        dateHint.style.display = "block";
      }
      timeField.style.display = type === "early" ? "block" : "none";
    }
    Object.entries(typeButtons).forEach(([key, btn]) => btn.addEventListener("click", () => selectType(key)));

    function close(value) {
      document.body.removeChild(overlay);
      resolve(value);
    }

    box.querySelector("[data-cancel]").addEventListener("click", () => close(null));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });

    box.querySelector("[data-submit]").addEventListener("click", () => {
      const date = dateInput.value;
      const reason = box.querySelector("[data-reason]").value.trim();
      if (!date) {
        box.querySelector("[data-error]").style.display = "block";
        return;
      }
      const expectedTime = box.querySelector("[data-expected-time]").value || undefined;
      close({ date, reason, type: selectedType, expectedTime });
    });
  });
}
