/**
 * animateCounter.js
 * Animates a number counting up to its final value — used for every KPI
 * figure across all three dashboards instead of the number just appearing.
 * Pure presentation: takes a value the page already computed and animates
 * displaying it, never computes anything itself.
 */

/**
 * @param {HTMLElement} el
 * @param {number} targetValue
 * @param {number} [duration] - ms
 * @param {(n:number) => string} [format] - defaults to rounding to an integer
 */
export function animateCounter(el, targetValue, duration = 650, format = (n) => String(Math.round(n))) {
  if (typeof targetValue !== "number" || Number.isNaN(targetValue)) {
    el.textContent = String(targetValue);
    return;
  }
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = format(targetValue);
    return;
  }

  const start = 0;
  const startTime = performance.now();

  function tick(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current = start + (targetValue - start) * eased;
    el.textContent = format(progress < 1 ? current : targetValue);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
