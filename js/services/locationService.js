/**
 * locationService.js
 * Geofencing (GPS distance to a store) + QR link validation. Checks a GPS
 * reading against every store in config/stores.js and reports WHICH one
 * matched — an employee never has to say which branch they're at; if a QR
 * code names a specific store, verification is scoped to just that one
 * (so scanning EG107's code while standing at EG222 correctly fails).
 *
 * Pure logic — returns data/promises, never touches the DOM, and never lets
 * a geolocation exception escape uncaught (some browsers throw synchronously
 * on getCurrentPosition() if permissions are misconfigured).
 */
import { STORES, getStoreById } from "../config/stores.js";
import { NOTIFICATION_CODES as CODE } from "../config/constants.js";
import { AuditService } from "./auditService.js";

/**
 * @param {number} lat1 @param {number} lng1 @param {number} lat2 @param {number} lng2
 * @returns {number} distance in meters between two coordinates (haversine formula).
 */
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const LocationService = Object.freeze({
  /**
   * QR check-in links look like: page.html?store=EG107
   * @returns {{present:boolean, valid:boolean, store:object|null}} `present`
   * is false when the page was opened as a plain link (no QR scanned);
   * `valid` is false when the QR names a store ID that isn't in STORES at
   * all (a typo, a QR from a different system, etc.) — it does NOT mean
   * "not your home store," since any recognized store is valid to check in at.
   */
  getQrContext() {
    const params = new URLSearchParams(window.location.search);
    const storeId = params.get("store");
    const store = storeId ? getStoreById(storeId) : null;
    return { present: !!storeId, valid: !!store, store };
  },

  /**
   * Verifies the caller is within radius of a store and reports which one.
   * @param {string} [preferredStoreId] - if given (from a scanned QR),
   * verification is scoped to only that store; otherwise every known store
   * is checked and the nearest in-range one wins.
   * @returns {Promise<{ok:true, store:object, distance:number} | {ok:false, code:string, params?:object}>}
   */
  verify(preferredStoreId) {
    const candidates = preferredStoreId ? STORES.filter((s) => s.id === preferredStoreId) : STORES;

    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ ok: false, code: CODE.LOCATION_UNSUPPORTED });
        return;
      }
      if (candidates.length === 0) {
        resolve({ ok: false, code: CODE.QR_MISMATCH });
        return;
      }

      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const distances = candidates.map((store) => ({
              store,
              distance: distanceMeters(pos.coords.latitude, pos.coords.longitude, store.lat, store.lng)
            }));
            const nearest = distances.sort((a, b) => a.distance - b.distance)[0];

            if (nearest.distance <= nearest.store.radiusMeters) {
              resolve({ ok: true, store: nearest.store, distance: Math.round(nearest.distance) });
            } else {
              resolve({
                ok: false,
                code: CODE.LOCATION_TOO_FAR,
                params: { distance: Math.round(nearest.distance), storeLabel: nearest.store.label }
              });
            }
          },
          () => resolve({ ok: false, code: CODE.LOCATION_DENIED }),
          { enableHighAccuracy: true, timeout: 8000 }
        );
      } catch (error) {
        // Defensive: some browsers/extensions throw synchronously instead of
        // invoking the error callback. Never let this reach the caller uncaught.
        AuditService.logError("locationService.verify", error);
        resolve({ ok: false, code: CODE.LOCATION_UNSUPPORTED });
      }
    });
  }
});
