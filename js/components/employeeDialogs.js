/**
 * employeeDialogs.js
 * Small self-contained forms for adding a roster entry and marking one
 * resigned/transferred. Same inline-styled approach as the other dialogs —
 * no new CSS file needed.
 */

/**
 * Today's date as YYYY-MM-DD in the user's LOCAL time — deliberately NOT
 * new Date().toISOString() (which is UTC and rolls over to "tomorrow" in
 * the early-morning hours in Egypt, making a just-added employee's start
 * date land in the future so they wouldn't show in today's view). Matches
 * dateUtils.todayKey()'s local-time logic exactly.
 */
function localToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

/**
 * @returns {Promise<{name:string, startDate:string} | null>}
 */
export function openAddEmployeeDialog() {
  return new Promise((resolve) => {
    const today = localToday();

    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed; inset:0; background:rgba(10,10,10,0.45); display:flex; align-items:center; justify-content:center; z-index:1000;";

    const box = document.createElement("div");
    box.style.cssText =
      "background:var(--white); border-radius:var(--radius-lg); padding:28px; max-width:340px; width:90%; box-shadow:var(--shadow-lg); font-family:inherit;";

    box.innerHTML = `
      <h3 style="font-family:var(--font-display); font-size:20px; font-weight:700; margin-bottom:16px;">Add employee</h3>
      <label style="display:block; font-size:12.5px; font-weight:600; margin-bottom:6px;">Full name</label>
      <input type="text" data-name placeholder="e.g. Amira Hassan" style="width:100%; padding:10px 12px; border:1px solid var(--gray-200); border-radius:var(--radius-sm); font-size:14px; margin-bottom:6px; font-family:inherit;">
      <p data-error style="display:none; font-size:12px; color:var(--red); margin-bottom:10px;">Enter a name (at least 2 characters).</p>

      <label style="display:block; font-size:12.5px; font-weight:600; margin-bottom:6px; margin-top:8px;">Start date</label>
      <input type="date" data-start-date value="${today}" style="width:100%; padding:10px 12px; border:1px solid var(--gray-200); border-radius:var(--radius-sm); font-size:14px; margin-bottom:6px; font-family:inherit;">
      <p style="font-size:11.5px; color:var(--gray-500); margin-bottom:6px;">Set a future date to add someone before their actual first day — they won't count as scheduled until then.</p>

      <div style="display:flex; gap:10px; margin-top:16px;">
        <button data-cancel style="flex:1; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--gray-200); background:var(--white); font-weight:600; font-size:13.5px; cursor:pointer;">Cancel</button>
        <button data-submit style="flex:1; padding:11px; border-radius:var(--radius-sm); border:none; background:var(--black); color:var(--white); font-family:var(--font-display); font-weight:700; font-size:14px; letter-spacing:0.03em; text-transform:uppercase; cursor:pointer;">Add</button>
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
      const name = box.querySelector("[data-name]").value.trim();
      if (name.length < 2) {
        box.querySelector("[data-error]").style.display = "block";
        return;
      }
      const startDate = box.querySelector("[data-start-date]").value || today;
      close({ name, startDate });
    });
  });
}

/**
 * The District Manager's "Manage employees" dialog — lists the full roster
 * (across all stores) with per-person actions: transfer to another store,
 * mark resigned, or remove. Takes the roster and store list, plus callback
 * handlers the page wires to EmployeeService. Kept presentational: it
 * collects intent and calls back, it doesn't touch services directly.
 * @param {object[]} roster
 * @param {{id:string,label:string}[]} stores
 * @param {{onTransfer:Function, onResign:Function, onRemove:Function}} handlers
 */
export function openDMManageEmployeesDialog(roster, stores, handlers) {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed; inset:0; background:rgba(10,10,10,0.45); display:flex; align-items:center; justify-content:center; z-index:1000;";

  const box = document.createElement("div");
  box.style.cssText =
    "background:var(--white); border-radius:var(--radius-lg); padding:24px; max-width:560px; width:92%; box-shadow:var(--shadow-lg); font-family:inherit; max-height:88vh; overflow-y:auto;";

  const storeLabel = (id) => (stores.find((s) => s.id === id) || {}).label || id;

  function rowHtml(emp) {
    const resigned = emp.endDate ? ` · <span style="color:var(--red);">resigned</span>` : "";
    return `
      <div data-emp-row="${emp.id}" style="display:flex; align-items:center; gap:10px; padding:11px 0; border-bottom:1px solid var(--gray-100);">
        <div style="flex:1; min-width:0;">
          <div style="font-weight:600; font-size:13.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${emp.name}</div>
          <div style="font-size:11.5px; color:var(--gray-500);">${emp.id} · ${storeLabel(emp.store)}${resigned}</div>
        </div>
        <button data-action="transfer" data-id="${emp.id}" style="padding:6px 10px; font-size:12px; font-weight:600; border-radius:var(--radius-sm); border:1px solid var(--gray-300); background:var(--white); cursor:pointer;">Transfer</button>
        <button data-action="resign" data-id="${emp.id}" style="padding:6px 10px; font-size:12px; font-weight:600; border-radius:var(--radius-sm); border:1px solid var(--gray-300); background:var(--white); cursor:pointer; ${emp.endDate ? "opacity:0.4; pointer-events:none;" : ""}">Resign</button>
        <button data-action="remove" data-id="${emp.id}" style="padding:6px 10px; font-size:12px; font-weight:600; border-radius:var(--radius-sm); border:1px solid var(--red); color:var(--red); background:var(--white); cursor:pointer;">Remove</button>
      </div>`;
  }

  const sorted = [...roster].sort((a, b) => (a.store || "").localeCompare(b.store || "") || a.name.localeCompare(b.name));
  box.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
      <h3 style="font-family:var(--font-display); font-size:20px; font-weight:700;">Manage employees</h3>
      <button data-close style="background:none; border:none; font-size:22px; line-height:1; cursor:pointer; color:var(--gray-400);">&times;</button>
    </div>
    <p style="font-size:12px; color:var(--gray-500); margin-bottom:10px;">Transfer changes an employee's primary store; Resign marks them departed (keeps history); Remove fully deletes — only for someone with no attendance history.</p>
    <input data-search type="text" placeholder="Search by name, ID, or store…" style="width:100%; padding:10px 12px; border:1px solid var(--gray-200); border-radius:var(--radius-sm); font-size:13.5px; margin-bottom:6px; font-family:inherit;">
    <p data-count style="font-size:11.5px; color:var(--gray-500); margin-bottom:8px;">${sorted.length} employees</p>
    <div data-list>${sorted.map(rowHtml).join("")}</div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Live search — filters the visible rows as the DM types. Works fine at
  // hundreds/thousands of employees because it just toggles display on
  // already-rendered rows (no re-fetch, no re-render).
  const searchInput = box.querySelector("[data-search]");
  const countEl = box.querySelector("[data-count]");
  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim().toLowerCase();
    let shown = 0;
    sorted.forEach((emp) => {
      const row = box.querySelector(`[data-emp-row="${emp.id}"]`);
      if (!row) return;
      const hay = `${emp.name} ${emp.id} ${storeLabel(emp.store)}`.toLowerCase();
      const match = !q || hay.includes(q);
      row.style.display = match ? "" : "none";
      if (match) shown += 1;
    });
    countEl.textContent = q ? `${shown} of ${sorted.length} employees` : `${sorted.length} employees`;
  });

  function close() {
    if (overlay.parentNode) document.body.removeChild(overlay);
  }
  box.querySelector("[data-close]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  box.querySelector("[data-list]").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    const emp = roster.find((r) => r.id === id);
    if (!emp) return;

    if (btn.dataset.action === "transfer") {
      const dest = await openTransferPickerDialog(emp, stores);
      if (dest) { close(); await handlers.onTransfer(id, dest); }
    } else if (btn.dataset.action === "resign") {
      if (confirm(`Mark ${emp.name} as resigned? Their attendance history is kept.`)) {
        close();
        await handlers.onResign(id);
      }
    } else if (btn.dataset.action === "remove") {
      if (confirm(`Remove ${emp.name} completely? This only works if they have no attendance history — otherwise use Resign.`)) {
        close();
        await handlers.onRemove(id);
      }
    }
  });
}

/**
 * A tiny store-picker for the transfer action. Resolves to the chosen
 * destination store id, or null if cancelled. Excludes the employee's
 * current store from the options.
 */
function openTransferPickerDialog(employee, stores) {
  return new Promise((resolve) => {
    const options = stores.filter((s) => s.id !== employee.store);

    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed; inset:0; background:rgba(10,10,10,0.55); display:flex; align-items:center; justify-content:center; z-index:1100;";
    const box = document.createElement("div");
    box.style.cssText =
      "background:var(--white); border-radius:var(--radius-lg); padding:26px; max-width:340px; width:90%; box-shadow:var(--shadow-lg); font-family:inherit;";
    box.innerHTML = `
      <h3 style="font-family:var(--font-display); font-size:18px; font-weight:700; margin-bottom:6px;">Transfer ${employee.name}</h3>
      <p style="font-size:12.5px; color:var(--gray-500); margin-bottom:14px;">Choose the store to move them to.</p>
      <select data-dest style="width:100%; padding:10px 12px; border:1px solid var(--gray-200); border-radius:var(--radius-sm); font-size:14px; margin-bottom:16px; font-family:inherit; background:var(--white);">
        ${options.map((s) => `<option value="${s.id}">${s.label}</option>`).join("")}
      </select>
      <div style="display:flex; gap:10px;">
        <button data-cancel style="flex:1; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--gray-200); background:var(--white); font-weight:600; font-size:13.5px; cursor:pointer;">Cancel</button>
        <button data-confirm style="flex:1; padding:11px; border-radius:var(--radius-sm); border:none; background:var(--black); color:var(--white); font-family:var(--font-display); font-weight:700; font-size:14px; text-transform:uppercase; cursor:pointer;">Transfer</button>
      </div>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function done(v) { if (overlay.parentNode) document.body.removeChild(overlay); resolve(v); }
    box.querySelector("[data-cancel]").addEventListener("click", () => done(null));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) done(null); });
    box.querySelector("[data-confirm]").addEventListener("click", () => done(box.querySelector("[data-dest]").value));
  });
}

/**
 * The District Manager's add-employee dialog — like the admin one, but the
 * DM oversees every store, so it adds a Store selector and a job Title
 * selector. Returns those two extra fields alongside name/startDate.
 * @param {{id:string, label:string}[]} stores - the store list to choose from
 * @returns {Promise<{name:string, startDate:string, store:string, title:string} | null>}
 */
export function openDMAddEmployeeDialog(stores) {
  return new Promise((resolve) => {
    const today = localToday();

    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed; inset:0; background:rgba(10,10,10,0.45); display:flex; align-items:center; justify-content:center; z-index:1000;";

    const box = document.createElement("div");
    box.style.cssText =
      "background:var(--white); border-radius:var(--radius-lg); padding:28px; max-width:360px; width:90%; box-shadow:var(--shadow-lg); font-family:inherit; max-height:90vh; overflow-y:auto;";

    const storeOptions = stores.map((s) => `<option value="${s.id}">${s.label}</option>`).join("");
    const titleOptions = ["Sales Associate", "Senior Sales", "Supervisor", "Store Manager"]
      .map((t) => `<option value="${t}">${t}</option>`)
      .join("");

    box.innerHTML = `
      <h3 style="font-family:var(--font-display); font-size:20px; font-weight:700; margin-bottom:16px;">Add employee</h3>

      <label style="display:block; font-size:12.5px; font-weight:600; margin-bottom:6px;">Full name</label>
      <input type="text" data-name placeholder="e.g. Amira Hassan" style="width:100%; padding:10px 12px; border:1px solid var(--gray-200); border-radius:var(--radius-sm); font-size:14px; margin-bottom:6px; font-family:inherit;">
      <p data-error style="display:none; font-size:12px; color:var(--red); margin-bottom:10px;">Enter a name (at least 2 characters).</p>

      <label style="display:block; font-size:12.5px; font-weight:600; margin-bottom:6px; margin-top:8px;">Store</label>
      <select data-store style="width:100%; padding:10px 12px; border:1px solid var(--gray-200); border-radius:var(--radius-sm); font-size:14px; margin-bottom:12px; font-family:inherit; background:var(--white);">${storeOptions}</select>

      <label style="display:block; font-size:12.5px; font-weight:600; margin-bottom:6px;">Job title</label>
      <select data-title style="width:100%; padding:10px 12px; border:1px solid var(--gray-200); border-radius:var(--radius-sm); font-size:14px; margin-bottom:12px; font-family:inherit; background:var(--white);">${titleOptions}</select>

      <label style="display:block; font-size:12.5px; font-weight:600; margin-bottom:6px;">Start date</label>
      <input type="date" data-start-date value="${today}" style="width:100%; padding:10px 12px; border:1px solid var(--gray-200); border-radius:var(--radius-sm); font-size:14px; margin-bottom:6px; font-family:inherit;">
      <p style="font-size:11.5px; color:var(--gray-500); margin-bottom:6px;">Set a future date to add someone before their actual first day — they won't count as scheduled until then.</p>

      <div style="display:flex; gap:10px; margin-top:16px;">
        <button data-cancel style="flex:1; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--gray-200); background:var(--white); font-weight:600; font-size:13.5px; cursor:pointer;">Cancel</button>
        <button data-submit style="flex:1; padding:11px; border-radius:var(--radius-sm); border:none; background:var(--black); color:var(--white); font-family:var(--font-display); font-weight:700; font-size:14px; letter-spacing:0.03em; text-transform:uppercase; cursor:pointer;">Add</button>
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
      const name = box.querySelector("[data-name]").value.trim();
      if (name.length < 2) {
        box.querySelector("[data-error]").style.display = "block";
        return;
      }
      const startDate = box.querySelector("[data-start-date]").value || today;
      const store = box.querySelector("[data-store]").value;
      const title = box.querySelector("[data-title]").value;
      close({ name, startDate, store, title });
    });
  });
}

/**
 * @param {{name:string}} employee
 * @returns {Promise<{endDate:string, endReason:"resigned"|"transferred", transferredTo?:string} | null>}
 */
export function openEmployeeStatusDialog(employee) {
  return new Promise((resolve) => {
    const today = localToday();

    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed; inset:0; background:rgba(10,10,10,0.45); display:flex; align-items:center; justify-content:center; z-index:1000;";

    const box = document.createElement("div");
    box.style.cssText =
      "background:var(--white); border-radius:var(--radius-lg); padding:28px; max-width:360px; width:90%; box-shadow:var(--shadow-lg); font-family:inherit;";

    box.innerHTML = `
      <h3 style="font-family:var(--font-display); font-size:20px; font-weight:700; margin-bottom:16px;">Mark ${employee.name} as left</h3>

      <label style="display:block; font-size:12.5px; font-weight:600; margin-bottom:6px;">Reason</label>
      <div style="display:flex; gap:8px; margin-bottom:14px;">
        <button type="button" data-reason="resigned" style="flex:1; padding:9px; border-radius:var(--radius-sm); border:1px solid var(--black); background:var(--black); color:var(--white); font-weight:600; font-size:13px; cursor:pointer;">Resigned</button>
        <button type="button" data-reason="transferred" style="flex:1; padding:9px; border-radius:var(--radius-sm); border:1px solid var(--gray-200); background:var(--white); color:var(--gray-800); font-weight:600; font-size:13px; cursor:pointer;">Transferred</button>
      </div>

      <div data-transfer-field style="display:none; margin-bottom:14px;">
        <label style="display:block; font-size:12.5px; font-weight:600; margin-bottom:6px;">Transferred to which store?</label>
        <input type="text" data-transferred-to placeholder="e.g. EG107 · Sheikh Zayed" style="width:100%; padding:10px 12px; border:1px solid var(--gray-200); border-radius:var(--radius-sm); font-size:14px; font-family:inherit;">
      </div>

      <label style="display:block; font-size:12.5px; font-weight:600; margin-bottom:6px;">Last active day at EG222</label>
      <input type="date" data-end-date value="${today}" style="width:100%; padding:10px 12px; border:1px solid var(--gray-200); border-radius:var(--radius-sm); font-size:14px; margin-bottom:6px; font-family:inherit;">
      <p data-error style="display:none; font-size:12px; color:var(--red); margin-bottom:10px;">Enter a valid date.</p>

      <div style="display:flex; gap:10px; margin-top:16px;">
        <button data-cancel style="flex:1; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--gray-200); background:var(--white); font-weight:600; font-size:13.5px; cursor:pointer;">Cancel</button>
        <button data-submit style="flex:1; padding:11px; border-radius:var(--radius-sm); border:none; background:var(--black); color:var(--white); font-family:var(--font-display); font-weight:700; font-size:14px; letter-spacing:0.03em; text-transform:uppercase; cursor:pointer;">Save</button>
      </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    let selectedReason = "resigned";
    const resignBtn = box.querySelector('[data-reason="resigned"]');
    const transferBtn = box.querySelector('[data-reason="transferred"]');
    const transferField = box.querySelector("[data-transfer-field]");

    function selectReason(reason) {
      selectedReason = reason;
      const isResigned = reason === "resigned";
      resignBtn.style.background = isResigned ? "var(--black)" : "var(--white)";
      resignBtn.style.color = isResigned ? "var(--white)" : "var(--gray-800)";
      resignBtn.style.borderColor = isResigned ? "var(--black)" : "var(--gray-200)";
      transferBtn.style.background = !isResigned ? "var(--black)" : "var(--white)";
      transferBtn.style.color = !isResigned ? "var(--white)" : "var(--gray-800)";
      transferBtn.style.borderColor = !isResigned ? "var(--black)" : "var(--gray-200)";
      transferField.style.display = isResigned ? "none" : "block";
    }
    resignBtn.addEventListener("click", () => selectReason("resigned"));
    transferBtn.addEventListener("click", () => selectReason("transferred"));

    function close(value) {
      document.body.removeChild(overlay);
      resolve(value);
    }

    box.querySelector("[data-cancel]").addEventListener("click", () => close(null));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });

    box.querySelector("[data-submit]").addEventListener("click", () => {
      const endDate = box.querySelector("[data-end-date]").value;
      if (!endDate) {
        box.querySelector("[data-error]").style.display = "block";
        return;
      }
      const transferredTo = box.querySelector("[data-transferred-to]").value.trim();
      close({ endDate, endReason: selectedReason, transferredTo: selectedReason === "transferred" ? transferredTo : "" });
    });
  });
}
