# Architecture — Onsite Attendance System

This document covers what changed in the **hardening pass** (validation,
audit logging, notifications, error handling, caching, and the storage
adapter). For the original layered overview (Pages → Services → Storage) and
folder structure, see `README.md`. Nothing here changes the UI — this is
entirely an internal-quality pass.

## Layers, after hardening

```
Pages (DOM + orchestration only)
   ↓ calls
Validation Service  ←  Rules (pure functions, no imports outside /rules)
   ↓
Engines (Shift Engine, Attendance Engine) — orchestrate rules + storage + audit
   ↓
Storage Service  →  Storage Adapter (localStorage today, swappable later)
   ↓
Audit Service — append-only log of what happened, written via Storage Service
Notification Service — the copy for every code the above layers raise
```

The rule that makes this maintainable, stated once more because it's the
whole point: **pages never decide anything.** They call a service, get back
`{ ok, code }` or `{ valid, code }`, and render whatever `NotificationService`
says for that code. If you ever find yourself writing `if (minutesLate > 5)`
inside a page file, that's a sign the logic escaped its layer.

## The Rules layer (`/js/rules`)

`shiftRules.js` and `attendanceRules.js` are intentionally the most boring
files in the project: every function takes plain data in and returns a plain
boolean/number out. No imports of config, storage, or the DOM. That's what
makes them:

- Safe for both `shiftEngine.js` and `validationService.js` to depend on
  without any circular-import risk (engines never import each other).
- Trivially unit-testable in plain Node with zero mocking (see `unit_test.mjs`
  during development — removed from the final deliverable, but the pattern
  is: `import` the rule, call it, assert the return value).

## Validation Service (`services/validationService.js`)

Composes the rule files into two decisions: "can this employee check in
right now" and "can this employee check out right now." It takes already-
gathered facts as input (`{ isKnownEmployee, shift, todayRecord }`) rather
than reaching into storage itself — the caller (`attendanceEngine.js`)
gathers the facts, `validationService.js` only judges them. This keeps the
validation layer free of storage/config imports.

`employeePage.js` also calls `AttendanceEngine.validateCheckIn()` *before*
starting the location/GPS flow, so the app never asks for GPS permission on
a day off or a duplicate check-in — and `attendanceEngine.checkIn()` calls
the same validation again right before writing (defense in depth: the page
check is for UX, the engine check is what actually protects the data).

## Notification Service (`services/notificationService.js`)

Every string a person can see is a `{ type, message }` entry in one catalog,
keyed by a code from `config/constants.js` → `NOTIFICATION_CODES`. Pages
never write message text inline. A few messages are templated functions
(e.g. `LOCATION_TOO_FAR` needs the live distance in meters) — the catalog
entry is a function in that case, called with whatever `params` the caller
passes.

## Audit Service (`services/auditService.js`)

Append-only event log: `LOGIN`, `LOGOUT`, `CHECK_IN`, `CHECK_OUT`,
`ATTENDANCE_EDIT` (reserved for a future admin-edit feature), `ERROR`.
Every engine method that changes state, and every page's catch block, calls
`AuditService.log...()`. Nothing in the app currently *displays* the audit
log — it's there so the data exists once IT/HR need to answer "who did what,
and when," without having to add logging retroactively.

## Storage layer (`services/storageService.js` + `services/supabaseService.js`)

**Update: this section originally described a planned future swap. That
swap happened** — see `docs/SUPABASE_MIGRATION.md` for the full record of
what changed and why. What follows is the current, real architecture.

`storageService.js` is still the only file every engine talks to for
persistence — that didn't change. What sits underneath it did:
`localStorageAdapter.js` is no longer used (kept in the repo for
reference/rollback, but nothing imports it); `storageService.js` now
delegates to `supabaseService.js`, the one file that imports the Supabase
client and knows any table or column name exists.

Every `storageService.js` method kept its exact name (`getRecords`,
`addRecord`, `updateRecord`, `findRecord`, `getAuditLog`, `addAuditEvent`,
`getRequests`, `addRequest`, `updateRequest`, `getRoster`, `saveRoster`,
`getClosures`) and is now `async`, exactly as this section originally
predicted — every caller in `attendanceEngine.js`, `requestService.js`,
`employeeService.js`, `closureService.js`, `auditService.js`,
`reportsService.js`, and `dmReportsService.js` added `await`, and nothing
about their business logic changed.

A handful of NEW, additive methods were needed
(`insertEmployee`/`updateEmployeeRow`/`deleteEmployee`/
`employeeHasAttendanceHistory`/`employeeHasRequests`/`insertClosure`/
`deleteClosure`) because `employeeService.js` and `closureService.js` used
to read an entire table into a JS array, mutate it, and save the whole
array back — a pattern that fit `localStorage` well but doesn't fit a real
database (rewriting every row to change one is wasteful and racy). Those
two services now use targeted single-row operations instead; their own
public method names (`addEmployee`, `removeEmployee`, `addClosure`, etc. —
what `adminPage.js` calls) didn't change at all.

### Read caching — removed, on purpose

The in-memory read cache `getRecords()` used to keep is gone. That cache
was specifically an optimization for a single device reading its own
`localStorage` repeatedly; keeping it now would mean one device not seeing
another device's check-in — exactly the problem this migration exists to
solve. Every read hits the database directly. `ShiftEngine`'s own
`(employeeId, date) → shiftKey` cache is untouched — that's pure
computation over a static, hardcoded schedule, not a storage read, so
nothing about it needed to change.

## Error handling

Every engine method that can fail (`attendanceEngine.checkIn/checkOut`,
`locationService.verify`, `loginPage`'s submit handler, `employeePage`'s
check-in/out click handlers, `adminPage.render`) is wrapped in `try/catch`.
On failure: the error is logged via `AuditService.logError(context, error)`,
and the person sees a normal notification banner (`GENERIC_ERROR` or a more
specific code) — never a blank screen or a browser console error with no
on-screen explanation. `main.js` has one more layer above all of this: if
the app fails to even bootstrap (e.g. a required DOM node is missing), it
shows a plain-text fallback message instead of a silently blank page.

## Business Rules reference

See `docs/BUSINESS_RULES.md` for the full table of every attendance edge
case (duplicate check-in, checkout-before-checkin, missing checkout, day
off, invalid shift, early/late check-in, overtime, midnight-crossing
shifts, browser refresh, invalid employee ID, and the store's Thu/Fri
schedule change) mapped to the exact function that enforces it.
