/**
 * clock.js
 * Live, ticking clock component. One interval drives every clock element on
 * the page (employee + admin both have their own clock chip in the topbar).
 */

export function startLiveClock(elementIds) {
  const elements = elementIds.map((id) => document.getElementById(id)).filter(Boolean);

  function tick() {
    const t = new Date().toLocaleTimeString("en-GB");
    elements.forEach((el) => (el.textContent = t));
  }

  tick();
  return setInterval(tick, 1000);
}
