/**
 * stores.js
 * The store registry. Every physical location the app can recognize a
 * check-in at lives here — locationService.js checks a GPS reading against
 * ALL of these (or one specific one, if a QR code names it) rather than a
 * single hardcoded location.
 *
 * CORRECTED (per Mohamed's real store map links): EG222 is actually
 * "Miami", not "San Stefano" as this file originally guessed — and EG107
 * is actually the REAL San Stefano branch, not an illustrative Mall-of-Egypt
 * placeholder. Coordinates below for Miami/San Stefano/Smouha are
 * approximate (based on each district's general area), explicitly at
 * Mohamed's request to unblock now rather than wait — refine with an
 * on-site GPS reading (long-press the pin in Google Maps) when convenient.
 * EG127 and EG215 are both inside malls whose exact unit Mohamed hasn't
 * pinned down yet — they use a clearly-marked placeholder coordinate
 * until he provides the real one.
 *
 * HOME_STORE_ID is which store THIS deployment/roster belongs to — the
 * store whose manager logs in as admin, whose roster shows in the
 * Employees screen, etc. An employee checking in at a DIFFERENT store
 * (covering a shift elsewhere) still gets recognized correctly; see
 * docs/BUSINESS_RULES.md → "Multi-store check-in".
 */
export const HOME_STORE_ID = "EG222";

export const STORES = Object.freeze([
  { id: "EG222", label: "EG222 · Miami",                    lat: 31.285000, lng: 30.021000, radiusMeters: 150 },
  { id: "EG107", label: "EG107 · San Stefano",               lat: 31.245550, lng: 29.966690, radiusMeters: 150 },
  { id: "EG212", label: "EG212 · Smouha",                    lat: 31.213000, lng: 29.947000, radiusMeters: 150 },
  { id: "EG127", label: "EG127 · (mall — location pending)", lat: 31.200000, lng: 29.920000, radiusMeters: 150 },
  { id: "EG215", label: "EG215 · (mall — location pending)", lat: 31.200000, lng: 29.920000, radiusMeters: 150 }
]);

/** @param {string} id @returns {object|null} */
export function getStoreById(id) {
  return STORES.find((s) => s.id === id) || null;
}

/** The store this deployment/roster is anchored to — used as the default label wherever a single "your store" context is shown. */
export const HOME_STORE = getStoreById(HOME_STORE_ID);
