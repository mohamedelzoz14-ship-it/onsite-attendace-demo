/**
 * notifications.js
 * Tiny reusable "banner" component. Used for the login error message and the
 * location-verification note — anywhere a small inline status needs a color + text.
 */

/**
 * @param {HTMLElement} element - the banner container (must have a text child or use textEl)
 * @param {HTMLElement} textEl - the element whose textContent gets updated
 * @param {string} baseClass - the element's base CSS class (state class is appended)
 */
export function createBanner(element, textEl, baseClass) {
  return {
    set(state, text) {
      element.className = state ? `${baseClass} ${state}` : baseClass;
      textEl.textContent = text;
    },
    show() {
      element.classList.add("show");
    },
    hide() {
      element.classList.remove("show");
    }
  };
}
