/**
 * dmRequestsDialog.js
 * The District Manager's pending-requests review dialog. Lists every
 * pending request across all stores with Approve / Reject actions. Kept
 * presentational: it renders the requests it's given and calls back to the
 * page's approve/reject handlers, which own the EmployeeService/
 * RequestService calls. Same inline-styled overlay approach as the other
 * dialogs.
 */

const TYPE_LABELS = {
  PLANNED_LEAVE: "Planned leave",
  SICK_LEAVE: "Sick leave",
  EARLY_LEAVE: "Early leave",
  MISSED_CHECKOUT_CORRECTION: "Missed check-out fix"
};

function typeLabel(t) {
  return TYPE_LABELS[t] || t;
}

/**
 * @param {object[]} pending - pending request objects
 * @param {(id:string,label:string)=>string} storeLabelFor - resolves a store id to its label (for showing where the employee is)
 * @param {object[]} roster - to look up each requester's store
 * @param {{onApprove:Function, onReject:Function}} handlers
 */
export function openDMRequestsDialog(pending, storeLabelFor, roster, handlers) {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed; inset:0; background:rgba(10,10,10,0.45); display:flex; align-items:center; justify-content:center; z-index:1000;";

  const box = document.createElement("div");
  box.style.cssText =
    "background:var(--white); border-radius:var(--radius-lg); padding:24px; max-width:560px; width:92%; box-shadow:var(--shadow-lg); font-family:inherit; max-height:88vh; overflow-y:auto;";

  const storeOf = (empId) => {
    const emp = roster.find((r) => r.id === empId);
    return emp ? storeLabelFor(emp.store) : "";
  };

  function fmtDate(d) {
    if (!d) return "";
    try { return new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
    catch { return d; }
  }

  function rowHtml(req) {
    const note = req.payload && req.payload.reason ? `<div style="font-size:11.5px; color:var(--gray-500); margin-top:2px;">"${req.payload.reason}"</div>` : "";
    return `
      <div data-req-row="${req.id}" style="padding:12px 0; border-bottom:1px solid var(--gray-100);">
        <div style="display:flex; align-items:flex-start; gap:10px;">
          <div style="flex:1; min-width:0;">
            <div style="font-weight:600; font-size:13.5px;">${req.employeeName || req.employeeId} <span style="font-weight:400; color:var(--gray-500);">· ${storeOf(req.employeeId)}</span></div>
            <div style="font-size:12px; color:var(--gray-600); margin-top:2px;">${typeLabel(req.type)}${req.targetDate ? " · " + fmtDate(req.targetDate) : ""}</div>
            ${note}
          </div>
          <div style="display:flex; gap:7px; flex-shrink:0;">
            <button data-action="approve" data-id="${req.id}" style="padding:6px 12px; font-size:12px; font-weight:700; border-radius:var(--radius-sm); border:none; background:var(--black); color:var(--white); cursor:pointer;">Approve</button>
            <button data-action="reject" data-id="${req.id}" style="padding:6px 12px; font-size:12px; font-weight:600; border-radius:var(--radius-sm); border:1px solid var(--red); color:var(--red); background:var(--white); cursor:pointer;">Reject</button>
          </div>
        </div>
      </div>`;
  }

  const empty = `<p style="text-align:center; color:var(--gray-500); padding:30px 0; font-size:13.5px;">No pending requests. All caught up.</p>`;
  box.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
      <h3 style="font-family:var(--font-display); font-size:20px; font-weight:700;">Pending requests</h3>
      <button data-close style="background:none; border:none; font-size:22px; line-height:1; cursor:pointer; color:var(--gray-400);">&times;</button>
    </div>
    <div data-list>${pending.length ? pending.map(rowHtml).join("") : empty}</div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  function close() {
    if (overlay.parentNode) document.body.removeChild(overlay);
  }
  box.querySelector("[data-close]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  box.querySelector("[data-list]").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    // Disable the row's buttons immediately to prevent double-clicks.
    const row = box.querySelector(`[data-req-row="${id}"]`);
    if (row) row.querySelectorAll("button").forEach((b) => { b.disabled = true; b.style.opacity = "0.5"; });

    if (btn.dataset.action === "approve") {
      await handlers.onApprove(id);
    } else {
      await handlers.onReject(id);
    }
    // Remove the handled row; close the dialog if it was the last one.
    if (row) row.remove();
    if (!box.querySelector("[data-req-row]")) {
      box.querySelector("[data-list]").innerHTML = empty;
    }
  });
}
