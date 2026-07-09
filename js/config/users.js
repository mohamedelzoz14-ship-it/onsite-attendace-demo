/**
 * users.js
 * Login accounts + the SEED roster.
 * In production this comes from the HR / roster system — see README.
 *
 * MIGRATED: Mohamed's login code changed from the original demo ID "1001"
 * to his real staff ID "1163" (per the master data sheet) — the Supabase
 * migration script (onsite-supabase/08_real_data_migration.sql) carries
 * his existing attendance/request history over to the new ID, so nothing
 * he's already logged is lost.
 *
 * PHASE 1 of the "District Manager oversees everything" change: the five
 * per-store manager logins (9000–9004) have been removed — the District
 * Manager (8000) is now the single oversight role across all stores, and
 * employees sign in only to check in/out. Removing them from this map is
 * what actually blocks their login (authService.login() validates against
 * USERS). Their staff_accounts rows are also removed in
 * onsite-supabase/09_remove_store_managers.sql so no orphaned login
 * codes remain in the database. This is deliberately the ONLY change in
 * Phase 1 — giving the DM write access (approvals, adding employees) is a
 * separate later step that also needs RLS policy changes, and isn't done
 * yet.
 */
import { ROLES } from "./constants.js";
import { getStoreById } from "./stores.js";

// Accounts that can actually sign in.
export const USERS = Object.freeze({
  "1163": { name: "Mohamed Abdelaziz",  role: ROLES.EMPLOYEE,         store: getStoreById("EG222").label, initial: "M" },
  "8000": { name: "Ahmed Abd Elaziz",   role: ROLES.DISTRICT_MANAGER, store: "All Stores",                initial: "A" }
});

/**
 * SEED_ROSTER only ever runs ONCE — the first time the app loads and
 * localStorage has no roster saved yet. Now that Supabase is the real
 * backend, this array never actually runs at all (EmployeeService.getRoster()
 * reads from Supabase exclusively) — kept only as a reference/fallback for
 * anyone running the app against a fresh, empty local setup without Supabase
 * configured. The old 1002–1005 demo people were removed from it to match
 * the real database (see onsite-supabase/10_remove_test_employees.sql).
 */
export const SEED_ROSTER = Object.freeze([
  { id: "1163", name: "Mohamed Abdelaziz", startDate: null, endDate: null, endReason: null, transferredTo: null }
]);
