/**
 * card.js
 * Small setters for the KPI cards (admin) and info cards (employee stats).
 * Kept separate from the pages so the "what goes in which DOM node" mapping
 * lives in one obvious place.
 */
import { animateCounter } from "../utils/animateCounter.js";

export function renderKpiCards(kpis) {
  animateCounter(document.getElementById("kpiPresent"), kpis.present);
  document.getElementById("kpiPresentSub").textContent = `of ${kpis.scheduledCount} scheduled today`;
  animateCounter(document.getElementById("kpiLate"), kpis.late);
  document.getElementById("kpiLateSub").textContent =
    kpis.late === 0 ? "no late arrivals yet" : `${kpis.late} arrived late today`;
  animateCounter(document.getElementById("kpiAbsent"), kpis.absent);
  animateCounter(document.getElementById("kpiMissing"), kpis.missingCheckout);
}

export function renderEmployeeStatCards({ shiftLabel, shiftTimeRange, monthSummary, weekHours }) {
  document.getElementById("statTodayShift").textContent = shiftTimeRange;
  document.getElementById("statTodayShiftLabel").textContent = shiftLabel;

  document.getElementById("statMonthDays").textContent = `${monthSummary.daysWorked} / ${monthSummary.daysSoFar} days`;
  document.getElementById("statMonthLate").textContent =
    `${monthSummary.lateCount} ${monthSummary.lateCount === 1 ? "late arrival" : "late arrivals"}`;

  document.getElementById("statWeekHours").textContent = `${weekHours} hrs`;
}
