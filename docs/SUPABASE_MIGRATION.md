# Supabase Migration — What Changed and Why

This records exactly what the LocalStorage → Supabase migration touched,
the handful of necessary adaptations, what was tested, and what's honestly
still open. See `SUPABASE_SETUP.md` for how to actually connect your
project (the one manual step left).

## Scope discipline

Per the migration requirements: no UI redesign, no business-rule change, no
attendance calculation change, no folder-structure change, every existing
service kept its name. Two files were **never touched at all**, and it's
worth stating plainly which ones and why:

- **`shiftEngine.js`** — every shift/overtime/late/early calculation lives
  here, and none of it ever touched `localStorage` in the first place (it
  reads a hardcoded `WEEKLY_SCHEDULE`). Nothing to migrate.
- **`validationService.js`** and every file in **`rules/`** — pure
  functions (data in, boolean/number out), no storage access, ever.

Confirmed by grep across the whole project before shipping — see the
"zero changes needed" check in the build log.

## Files created

| File | Purpose |
|---|---|
| `js/config/supabaseConfig.js` | The only file with real credentials — empty placeholders by default |
| `js/services/supabaseService.js` | The single file that talks to Supabase; every camelCase ↔ snake_case field mapping lives here |
| `.env.example` | Documents the two required values (informational — see its own header comment for why a real `.env` can't work in a build-step-free static site) |
| `SUPABASE_SETUP.md` | Step-by-step connection guide |
| `onsite-supabase/07_auth_bridge_policy.sql` | One additional RLS policy needed for login to work at all (see below) |

## Files converted to `async`/`await`

Every method's business logic is unchanged — every `if` condition and every
number computed is identical to the localStorage version. What changed:
every method that touches `StorageService` is now `async`, and every caller
now `await`s it.

`storageService.js`, `attendanceEngine.js`, `requestService.js`,
`employeeService.js`, `closureService.js`, `auditService.js`,
`authService.js`, `reportsService.js`, `dmReportsService.js`,
`employeePage.js`, `adminPage.js`, `dmPage.js`, `main.js`, `loginPage.js`.

## Necessary adaptations (not rule changes — persistence-layer mechanics)

**1. Request and audit-log IDs are now database-assigned.**
`requestService.js` used to generate its own IDs client-side
(`req-<timestamp>-<sequence>`) before saving. Supabase's `requests` table
assigns a proper UUID on insert instead — `StorageService.addRequest()` now
returns the created row (including its real ID), and every `submit*()`
method uses that returned object instead of a locally-built one. Same
pattern for `audit_log`. Nothing about what an ID is *used for* changed,
only who assigns it.

**2. Bulk "read-all, mutate, save-all" became targeted single-row operations.**
`employeeService.js` and `closureService.js` used to fetch an entire table
into a JS array, change one entry, and save the whole array back — fine for
`localStorage`, wasteful and racy for a real database. They now call
targeted operations (`insertEmployee`, `updateEmployeeRow`, `deleteEmployee`,
`insertClosure`, `deleteClosure`) instead. The public methods those two
services expose (`addEmployee`, `removeEmployee`, `setEmployeeStatus`,
`reactivateEmployee`, `addClosure`, `removeClosure` — what `adminPage.js`
actually calls) kept their exact names and behavior.

**3. The audit log's `employee_id` vs `acting_login_code` routing.**
The database has two separate columns: one for "which roster employee is
this about" (foreign-keyed to the `employees` table) and one for "which
staff login performed this" (foreign-keyed to `staff_accounts`, which also
covers admin/DM logins that aren't roster employees at all). A LOGIN event's
JS shape uses a field literally called `employeeId` for whoever's signing
in — but that could be `9000` (the admin) or `8000` (the DM), neither of
which exist in the `employees` table. `supabaseService.js` routes each event
type's fields to the correct column based on what that event actually means
(see the `AUDIT_ACTOR_FIELD_BY_EVENT` / `AUDIT_SUBJECT_IS_EMPLOYEE` tables
in that file) — tested explicitly for every event type, including this exact
scenario.

**4. Login now also establishes a real Supabase Auth session.**
Every Row Level Security policy (already written and tested against
PostgreSQL directly before this phase) keys off `auth.uid()` — but the
app's login has never been more than "type an ID, any password." Without a
real Supabase Auth session, `auth.uid()` is `NULL` for every request, and
every policy correctly denies access. `authService.js`'s `login()` now also
calls `linkSupabaseSession()` (in `supabaseService.js`), which creates an
anonymous Supabase Auth session and links it to the typed login code — see
`onsite-supabase/07_auth_bridge_policy.sql` for the one additional policy
this requires, and its comments for the honest limit of this approach (it
makes RLS *functional*, it does not add password verification — that
was never part of this app's login to begin with).

## Tested before delivery

Two separate test passes, since a live connection to your specific
Supabase project isn't reachable from here:

1. **Field-mapping tests (38 assertions)** — a mock Supabase client
   (mimicking the real chainable query-builder API) exercised every method
   in `supabaseService.js`, including the trickiest case: confirming a
   `LOGIN` event for admin `9000` correctly avoids the `employees` foreign
   key while a `CHECK_IN` event for employee `1001` correctly uses it.
2. **Business-logic tests (22 assertions)** — the REAL, unmodified
   `attendanceEngine.js`/`requestService.js`/`employeeService.js`/
   `closureService.js`/`reportsService.js` ran against a simple in-memory
   async stand-in for `storageService.js`, confirming check-in/out, store
   closures blocking check-in, the request approve flow, and the employee
   lifecycle (including the "can't delete with history" guard) all still
   work exactly as before.

Both passed completely before this was handed over. The RLS policies
themselves were already tested against real PostgreSQL in the prior phase
(see `onsite-supabase/06_MIGRATION.md`) — that testing is unaffected by
this phase and still holds.

## What's honestly still open

- **The GPS/QR geofence check stays client-side.** Whether a phone is
  physically near a store is information the device has, not something the
  database can verify on its own — this was already flagged as a known gap
  in the backend-prep phase and remains one.
- **Column-level write restrictions aren't fully enforced by RLS alone**
  (e.g., nothing currently stops the same UPDATE an employee uses to check
  out from also touching `overtime_confirmed`). The recommended fix —
  moving check-in/check-out/confirm-overtime to Postgres RPC functions — is
  still a good next step, not part of this pass.
- **Real password authentication is still not part of this app.** The
  anonymous-session bridge makes RLS work correctly for the honest case; it
  doesn't add credential verification. That's a separate, larger feature if
  you want it later.
