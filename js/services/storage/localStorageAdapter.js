/**
 * localStorageAdapter.js
 * The ONLY file in the entire app that calls the raw `localStorage` API.
 * Implements a tiny generic contract — get(key), set(key,value), remove(key) —
 * so storageService.js never needs to know *how* data is persisted.
 *
 * To move to Supabase later: write a `supabaseAdapter.js` that implements the
 * same three methods (they can become `async` — see docs/ARCHITECTURE.md,
 * "Swapping the Storage Adapter"), then change ONE import line in
 * storageService.js. No engine, page, or component needs to change.
 *
 * @typedef {Object} StorageAdapter
 * @property {(key:string) => any|null} get
 * @property {(key:string, value:any) => boolean} set
 * @property {(key:string) => boolean} remove
 */

/** @type {StorageAdapter} */
export const localStorageAdapter = Object.freeze({
  get(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn(`localStorageAdapter: could not read "${key}".`, e);
      return null;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn(`localStorageAdapter: could not write "${key}".`, e);
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.warn(`localStorageAdapter: could not remove "${key}".`, e);
      return false;
    }
  }
});
