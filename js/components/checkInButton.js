/**
 * checkInButton.js
 * Visual states for the big round check-in/check-out button + its status badge.
 * This component only renders state it's given — it never decides whether
 * someone is late, off, or allowed to check in (that's attendanceEngine.js / shiftEngine.js).
 */
import { formatTime, formatElapsed } from "../utils/dateUtils.js";

export function createCheckInButton(refs) {
  // refs = { button, label, sub, badge, badgeText, meta }
  let tickHandle = null;

  function stopTicking() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
  }

  return {
    showNotCheckedIn(shiftStartLabel) {
      stopTicking();
      refs.button.disabled = false;
      refs.button.classList.remove("checked-in", "pulse");
      refs.label.textContent = "Check In";
      refs.sub.textContent = "Tap to start shift";
      refs.badge.className = "status-badge out";
      refs.badgeText.textContent = "Not checked in";
      refs.meta.textContent = `Shift starts ${shiftStartLabel} · Not yet checked in today`;
    },

    showDayOff(label = "Day off", sub = "No shift scheduled") {
      stopTicking();
      refs.button.disabled = true;
      refs.button.classList.remove("checked-in", "pulse");
      refs.label.textContent = label;
      refs.sub.textContent = sub;
      refs.badge.className = "status-badge out";
      refs.badgeText.textContent = "Not checked in";
      refs.meta.textContent = "You're scheduled off today";
    },

    showLocating() {
      refs.button.disabled = true;
      refs.label.textContent = "Locating…";
    },

    showCheckedIn(record) {
      stopTicking();
      refs.button.disabled = false;
      refs.button.classList.add("checked-in", "pulse");
      refs.label.textContent = "Check Out";
      refs.sub.textContent = "Tap to end shift";
      refs.badge.className = "status-badge " + (record.status === "late" ? "late" : "present");
      refs.badgeText.textContent = record.status === "late" ? "Checked in · Late" : "Checked in · Present";

      const update = () => {
        const elapsed = formatElapsed(new Date() - new Date(record.checkInTime));
        refs.meta.innerHTML = `
          <div class="shift-clock">
            <span class="shift-clock-label">On shift for</span>
            <span class="shift-clock-figure">${elapsed}</span>
          </div>
          <div class="shift-clock-sub">Checked in at ${formatTime(record.checkInTime)}</div>
        `;
      };
      update();
      tickHandle = setInterval(update, 1000);
    },

    showCompleted(record) {
      stopTicking();
      refs.button.classList.remove("pulse");
      refs.button.classList.add("checked-in");
      refs.button.disabled = true;
      refs.label.textContent = "Shift completed";
      refs.sub.textContent = "See you tomorrow";
      refs.badge.className = "status-badge present";
      refs.badgeText.textContent = "Completed Shift";
      let earlyNote = "";
      if (record.earlyLeave) {
        earlyNote = record.earlyLeaveAuthorized ? " · Left early (approved)" : " · Left early (not yet authorized)";
      }
      refs.meta.innerHTML = `
        <div class="shift-clock">
          <span class="shift-clock-label">Total worked</span>
          <span class="shift-clock-figure">${record.totalHours} hrs</span>
        </div>
        <div class="shift-clock-sub">${formatTime(record.checkInTime)} – ${formatTime(record.checkOutTime)}${earlyNote}</div>
      `;
    },

    resetLabelToCheckIn() {
      refs.button.disabled = false;
      refs.label.textContent = "Check In";
    },

    destroy() {
      stopTicking();
    }
  };
}
