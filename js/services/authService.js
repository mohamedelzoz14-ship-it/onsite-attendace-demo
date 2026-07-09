/**
 * authService.js
 * Login/logout + "who's currently signed in" for this browser tab.
 * Session lives in memory only, same as before — refreshing the page
 * already logged you out before this migration, and still does now.
 * Every login/logout is recorded to the Audit Log.
 *
 * Migration note: login() now ALSO establishes a real Supabase Auth
 * session (anonymous) and links it to the login code, via
 * linkSupabaseSession() in supabaseService.js — this is required for the
 * Row Level Security policies to work at all (see
 * onsite-supabase/07_auth_bridge_policy.sql for exactly why). Nothing
 * about the VISIBLE login flow changed: it's still "type an ID, any
 * password", still returns the same user object, still fails the same
 * way for an unrecognized ID.
 */
import { USERS } from "../config/users.js";
import { AuditService } from "./auditService.js";
import { linkSupabaseSession } from "./supabaseService.js";

let currentUserId = null;

export const AuthService = Object.freeze({
  /**
   * @param {string} employeeId
   * @returns {Promise<object|null>} the matched user object, or null if the ID isn't recognized.
   */
  async login(employeeId) {
    const user = USERS[employeeId];
    if (!user) return null;

    await linkSupabaseSession(employeeId);

    currentUserId = employeeId;
    await AuditService.logLogin(employeeId, user.role);
    return user;
  },

  async logout() {
    if (currentUserId) await AuditService.logLogout(currentUserId);
    currentUserId = null;
  },

  /** @returns {string|null} */
  getCurrentUserId() {
    return currentUserId;
  },

  /** @returns {object|null} */
  getCurrentUser() {
    return currentUserId ? USERS[currentUserId] : null;
  }
});
