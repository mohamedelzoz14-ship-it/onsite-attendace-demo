# Business Rules Reference

Every attendance edge case, what the app does about it, and exactly which
function enforces it. See `docs/ARCHITECTURE.md` for how these layers fit
together.

| Edge case | Behavior | Enforced by |
|---|---|---|
| **Check In twice** | Second check-in same day is blocked; button is already in "Check Out" state so it can't even be attempted from the UI, but the engine also rejects it directly. | `attendanceRules.hasCheckedInToday()` → `validationService.validateCheckIn()` → code `ALREADY_CHECKED_IN` |
| **Check Out before Check In** | If a stored check-in timestamp is somehow later than the check-out attempt (clock skew, edited record), checkout is rejected rather than saving a negative duration. | `attendanceRules.isCheckoutBeforeCheckin()` → `validationService.validateCheckOut()` → code `CHECKOUT_BEFORE_CHECKIN` |
| **Missing Check Out** | Any past-day record still open (no `checkOutTime`) is marked `missing` the next time anyone logs in. Runs once per login, idempotent. | `attendanceRules.isMissingCheckout()` → `attendanceEngine.detectMissingCheckouts()` |
| **Off Day** | Employee scheduled off today sees a disabled "Day off" button and can't check in; validated again server-side (engine) even if the UI were bypassed. | `shiftRules.isDayOff()` → `validationService.validateCheckIn()` → code `DAY_OFF_TODAY` |
| **Invalid Shift** | A malformed shift config entry (e.g. `start === end`, or a shift key with no matching definition) blocks check-in instead of silently computing nonsense hours. | `shiftRules.isValidShift()` → `validationService.validateCheckIn()` → code `INVALID_SHIFT` |
| **Early Check In** | Checking in more than 30 minutes before shift start is recorded (`record.early = true`) and surfaced with a distinct (still positive) message, but is **not** blocked — early arrival isn't an error. | `shiftRules.isEarly()` → `shiftEngine.isEarly()` → `attendanceEngine.checkIn()` → code `CHECK_IN_SUCCESS_EARLY` |
| **Late Check In** | Checking in more than the grace period (5 min) after shift start sets `status: "late"`. | `shiftRules.isLate()` → `shiftEngine.isLate()` → `attendanceEngine.checkIn()` → code `CHECK_IN_SUCCESS_LATE` |
| **Early leave (leaving before shift ends)** | Never blocked — checkout always succeeds. If it happens more than 30 min before shift end, the record is flagged `earlyLeave: true`. An approved early-leave request (submitted before OR after the fact) marks it `earlyLeaveAuthorized: true` instead of leaving it as an unexplained early departure. This is per-day and per-instance — it never affects any other day, unlike planned/sick leave. | `shiftRules.isEarlyLeave()` → `shiftEngine.isEarlyLeave()` → `attendanceEngine.checkOut()`; approval path in `requestService.approveRequest()` |
| **Overtime** | Hours worked beyond the employee's scheduled shift length are computed at checkout and stored on the record (`overtimeHours`); the person sees a distinct success message when overtime > 0. | `shiftRules.computeOvertime()` → `shiftEngine.computeOvertime()` → `attendanceEngine.checkOut()` → code `CHECK_OUT_SUCCESS_OVERTIME` |
| **Shift crossing midnight** | Working-hours math (`computeScheduledHours`) already adds 24h when `end < start`, so a shift that wraps past midnight computes correctly. No current shift actually crosses midnight (Extended ends exactly at 24:00) but the math is correct if one ever does. | `shiftRules.crossesMidnight()`, `shiftRules.computeScheduledHours()` |
| **Browser refresh** | There's no separate "session" for attendance state — every render re-reads today's record from `AttendanceEngine.getTodayRecord()`, which reads straight from storage. A refresh just re-runs that read; there's nothing in-memory to lose. | `employeePage.mount()` → `attendanceEngine.getTodayRecord()` on every mount |
| **Invalid employee** | An Employee ID that isn't in the roster is rejected at login (can't reach any attendance flow at all), and is checked again defensively inside the engine in case a caller ever skips the login screen. | `authService.login()` (login gate) + `attendanceRules.isKnownEmployee()` → `validationService.validateCheckIn()` → code `INVALID_EMPLOYEE` |
| **Weekend rules** | "Weekend" for this store means the Thursday/Friday schedule change (Extended shift, 3 PM–12 AM), not the Fri/Sat calendar weekend — named explicitly as `shiftRules.isExtendedScheduleDay()` so the assumption isn't an unexplained `getDay() === 5` buried in engine code. Each employee's actual day off is still whatever `WEEKLY_SCHEDULE` says for them individually. | `shiftRules.isExtendedScheduleDay()`, `config/shiftConfig.js` → `WEEKLY_SCHEDULE` |
| **Public holidays** | A store-wide holiday (Eid, national holidays, etc.) is tracked for reporting/holiday-pay purposes, but does **not** block check-in — most retail stores (especially in malls) stay open on holidays and staff still work, often for holiday pay. An employee still checks in normally; the dashboard just shows a small "🎉 {holiday}" note as a heads-up that the day may qualify for holiday pay. An employee who genuinely isn't coming in on a holiday needs an **approved Planned Leave** request instead (see below) — the same as any other day. | `shiftEngine.getHolidayFor()` (informational only — never overrides `getShiftKeyFor()`) → `config/holidays.js` → `PUBLIC_HOLIDAYS` |
| **Planned leave** | An employee can request a future (or today's) date off. Once a manager approves it, that date is excluded from "Absent" and shows a distinct "On leave" status — and check-in is blocked for that date, the same way a personal day off is. Can't request a past date, a date that already has attendance recorded, or a date that already has a pending/approved leave request. | `rules/requestRules.isFutureOrTodayDate()`, `hasApprovedLeaveFor()` → `requestService.submitPlannedLeave()` / `hasApprovedLeaveFor()` → `validationService.validateCheckIn()` (via the `onApprovedLeave` fact) |
| **Employee resigned/transferred** | From their recorded last active day onward, an employee disappears from "today" entirely (not even shown as "Absent") and can't check in — but every past attendance record stays intact and searchable via the "all history" filter. Deleting an employee outright is only allowed if they have zero attendance/request history; anyone with real history must be marked resigned/transferred instead. | `rules/employeeRules.isActiveOn()`, `canRemoveEmployee()` → `employeeService.js` → `validationService.validateCheckIn()` (via the `isActiveEmployee` fact), `reportsService.js` (excluded from "today") |
| **Employee not yet started** | An employee can be pre-registered with a future join date (e.g. added a week before their actual first day). They stay on the full roster but don't count toward "today" in any way — not scheduled, not absent, can't check in — until that date arrives. Same underlying mechanism as resignation, just the other end of the date range. | `rules/employeeRules.isActiveOn()` (checks `startDate` the same way it checks `endDate`) → `employeeService.addEmployee()` |
| **Store fully closed** (power cut, weather, lockdown) | Different from a public holiday: the store genuinely couldn't operate, so this DOES block check-in and DOES exclude everyone without an existing record from "Absent" (they show as "Store closed" instead). Admin-declared, any date (past or future), removable if declared by mistake. | `rules/closureRules.js` → `closureService.js` → `validationService.validateCheckIn()` (via `isStoreClosed`), `reportsService.js` (excluded from "today") |
| **Repeated lateness** | Purely informational — the admin dashboard flags anyone with 3+ late arrivals in the current calendar month, with the specific dates, so a manager can follow up. No automatic action is taken. | `reportsService.getLatenessPatterns()`, threshold in `shiftConfig.js` → `SHIFT_RULES.latenessAlertThreshold` |
| **Covering a shift at another branch** | An employee doesn't pick which store they're at — GPS is checked against every known store, and whichever one is in range wins. Checking in at a different store than their home store still succeeds; the record captures the store actually checked into, and the admin table flags it (🔄) as a heads-up rather than confusing it with a normal shift. | `locationService.verify()` (checks all of `config/stores.js` → `STORES` and returns whichever matched) → `attendanceEngine.checkIn()` stores the real store ID → `adminPage.js` flags `record.store !== HOME_STORE.id` |

## Notification codes → messages

Every code referenced above (and a few more for location/QR verification)
resolves to user-facing copy in exactly one place:
`services/notificationService.js`. See that file for the full catalog.

## Request & Approval System

Two request types have a working end-to-end flow so far — **missed-checkout
correction** and **planned leave**. Both share the same underlying plumbing
(`requestService.js`, one Pending Requests queue, the same approve/reject
mechanics), which is what makes adding `EARLY_LEAVE` / `SICK_LEAVE` later a
matter of writing one `submit*` method each, not rebuilding the review flow.

### Missed-checkout correction

| Step | What happens | Enforced by |
|---|---|---|
| Employee sees a "Fix" button | Only appears next to a day already flagged `missing` by `detectMissingCheckouts()` — never on a normal day. | `rules/requestRules.canRequestMissedCheckoutCorrection()` |
| Employee submits a correction | Proposed check-out must be after the recorded check-in; a second request can't be submitted while one is still pending for that day. | `rules/requestRules.isValidProposedCheckout()`, `hasPendingRequestFor()` → `requestService.submitMissedCheckoutCorrection()` |
| Admin approves | The attendance record's `checkOutTime`, `totalHours`, and `overtimeHours` are (re)computed via `shiftEngine`, and the day's status is **re-derived** (present/late) rather than just clearing "missing". | `requestService.approveRequest()` |
| Admin rejects | The underlying attendance record is untouched; the employee can submit a new request for the same day afterward. | `requestService.rejectRequest()` |

### Planned leave

| Step | What happens | Enforced by |
|---|---|---|
| Employee requests a day off | Must be today or a future date; rejected if that date already has attendance recorded, or already has a pending/approved leave request. | `rules/requestRules.isFutureOrTodayDate()`, `hasApprovedLeaveFor()` → `requestService.submitPlannedLeave()` |
| Admin reviews | Shows in the same Pending Requests queue as correction requests, distinguished by its Type column. | `requestService.getPendingRequests()` |
| Admin approves | No attendance record to correct (nothing happened yet) — the request itself becomes the source of truth. From that point, `hasApprovedLeaveFor(employeeId, date)` returns true for that date. | `requestService.approveRequest()` |
| Employee tries to check in on an approved-leave day | Blocked, the same way a personal day off is blocked — but the underlying reason is tracked separately (`ON_LEAVE` status vs. `DAY_OFF` status) since they mean different things for payroll. | `attendanceEngine.validateCheckIn()` passes `onApprovedLeave` → `validationService.validateCheckIn()` |
| Admin dashboard | An approved-leave day shows as "On leave" (not "Absent") in the table and is excluded from the Absent KPI. | `reportsService.getTodayKpis()`, `getFilteredRows()` |

### Sick leave

Identical guards to planned leave, with one difference: any date is
allowed, including a past one — sick leave is often reported after
returning to work, not requested in advance.

### Early leave

Different in kind from the other three: the employee IS working that day —
they just need (or needed) to leave before the shift officially ends.
Never blocks anything; it's purely about whether an early departure ends up
tagged "authorized" or not.

| Step | What happens |
|---|---|
| Employee checks out early | Always succeeds. If more than 30 minutes before shift end, the record is flagged `earlyLeave: true`, `earlyLeaveAuthorized: false` by default. |
| Employee submits a request **before** leaving | No record to touch yet. When they do check out early, `attendanceEngine.checkOut()` checks `hasApprovedEarlyLeaveFor()` live and marks it authorized from the start — no separate patch step needed. |
| Employee submits a request **after** already leaving early | The record already exists with `earlyLeaveAuthorized: false`. Approving the request patches that same record to `true` — same mechanism as a missed-checkout correction, just a different field. |
| Admin dashboard | Records with `earlyLeave: true` show a small "Left early (approved)" or "Left early (unauthorized)" tag next to the status pill — informational, never blocking. |

Either request type, either outcome: recorded to the Audit Log
(`REQUEST_SUBMITTED`, `REQUEST_APPROVED`/`REQUEST_REJECTED`, plus
`ATTENDANCE_EDIT` when a correction actually changes a record).

**Security note:** the request's `reason` field is free text typed by an
employee and displayed inside the admin's table via `innerHTML` — it's
passed through `utils/domUtils.escapeHtml()` before rendering so it can
never inject markup/scripts into the admin's page.

## Employee Lifecycle

The admin's **Employees** section (sidebar → Employees) manages who's on the
EG222 roster. Unlike the Request & Approval system above, these are
**direct admin actions** — no employee submits anything, and nothing needs
separate approval (an admin marking someone resigned doesn't need a second
admin to sign off).

| Action | Effect | Enforced by |
|---|---|---|
| **Add employee** | Creates a new roster entry with the next free ID and a start date (defaults to today; set a future date to pre-register someone before their actual first day — see the join-date row in the edge-case table above). Doesn't create a login account — see the access-control note below. | `rules/employeeRules.isValidName()`, `isValidDate()` → `employeeService.addEmployee()` |
| **Mark resigned / transferred** | Sets a last-active-day (`endDate`) and a reason. From the day *after* that date, the employee stops appearing in "today" views entirely — not even as "Absent" — while every prior attendance record stays fully intact. Check-in is blocked from that point on. | `employeeService.setEmployeeStatus()` → `rules/employeeRules.isActiveOn()` |
| **Reactivate** | Clears the end date — undoes a mistaken resignation/transfer, or brings back an employee who returned. | `employeeService.reactivateEmployee()` |
| **Remove** | Hard-deletes the roster entry. Only allowed if the employee has **zero** attendance records and **zero** requests — otherwise blocked, because deleting would silently destroy real history. Confirmed via a dialog before it happens (irreversible). | `rules/employeeRules.canRemoveEmployee()` → `employeeService.removeEmployee()` |

**Storage note:** the roster used to be a static array in `config/users.js`.
It's now backed by `storageService.getRoster()`/`saveRoster()` — the config
file's `SEED_ROSTER` only ever runs once, the very first time the app loads
with no roster saved yet. Every add/resign/transfer/remove after that persists
through the same storage layer as everything else.

**Access-control note (an honest limitation, not a design choice):** any
admin login can add, resign, transfer, or remove any employee — there's no
tiered permission system (e.g. "can approve leave" vs. "can delete
employees") in this prototype. The only real protection today is the audit
trail (`EMPLOYEE_ADDED`/`EMPLOYEE_STATUS_CHANGED`/`EMPLOYEE_REMOVED`, each
tagged with which admin ID performed it) and the confirmation dialog before
a delete. Real access control needs a real backend with actual
authentication — see `docs/ARCHITECTURE.md` → "Swapping the Storage Adapter".
Separately: adding someone here adds them to the *roster* (for attendance/
reporting purposes) — it does not give them a login account, since this
demo's login accounts (`config/users.js` → `USERS`) are a separate, smaller,
hardcoded list (1001, 1002, 9000).

## Multi-store check-in

Solves a specific, real scenario: an EG222 employee is asked to cover a
shift at another branch — where do they check in from?

**The answer: they don't have to know or choose.** `config/stores.js`
holds every store the app recognizes (each with its own coordinates and
geofence radius). `locationService.verify()` checks a GPS reading against
**all** of them and returns whichever one matched, instead of only ever
checking against one hardcoded location.

| Situation | What happens |
|---|---|
| Employee is at their home store (EG222) | Detected and recorded exactly as before — nothing changes for the normal case. |
| Employee is physically at a different known store (e.g. EG107) | GPS still succeeds — it just reports EG107 as the match. `attendanceEngine.checkIn()` records `store: "EG107"` on that day's record, even though the employee's home store is EG222. |
| Employee scans a QR code that names a specific store | Verification is scoped to *only* that store — standing at EG222 while a QR claims EG107 correctly fails, rather than silently falling back to "any store." |
| Employee is nowhere near any known store | Rejected, and the message names the *nearest* store and how far away it is (there's no single "the store" anymore, so the message has to say which one it means). |
| Admin views today's attendance | A record where `store !== HOME_STORE.id` is visually flagged (🔄) in the table — the manager sees "covering at EG107" at a glance instead of it looking like a data error. |

**Current scope, stated honestly:** this solves *detection* (GPS recognizes
more than one place) and *recording* (the correct store lands on the
record) for a single admin's dashboard (EG222's). It does **not** yet mean
this is a true multi-store deployment — there's still one roster, one
Employees screen, one set of shift schedules, all belonging to EG222. A
real multi-branch rollout (separate rosters, separate admin logins per
store, cross-store shift assignment) is the bigger project already flagged
as needing the real Excel/Power Automate backend — see README → "Future
Backend Plan". `config/stores.js` → `STORES` currently has one real entry
(EG222) and one illustrative example (EG107, Adidas @ Mall of Egypt) — swap
in your actual second branch's code and coordinates when you have them.

## Overtime confirmation

**This is a data-accuracy check, not a payroll decision.** Nobody's salary
is decided by this app. What this feature does: the store manager (the
person actually authorized to review shift/schedule matters) confirms the
*recorded hours* look right before they'd ever be handed off to whatever
process actually calculates pay (today, that's entirely manual/Excel —
outside this app, unchanged by it).

| Step | What happens |
|---|---|
| Checkout includes overtime | `overtimeConfirmed` starts `false` automatically — the hours are saved immediately (nothing is held up), just flagged as not-yet-reviewed. |
| Checkout with no overtime | `overtimeConfirmed` is `true` from the start — there's nothing to review. |
| Manager reviews | The admin dashboard's "Overtime to confirm" panel lists every unconfirmed record. |
| Manager confirms | Marks `overtimeConfirmed: true` and records **who** confirmed it and **when** — the app never touches `overtimeHours` itself at this step, only adds a confirmation stamp. |
| Missed-checkout correction | If approving a correction recomputes overtime, the new value also starts unconfirmed — a corrected number needs the same review as an original one. |

**What this deliberately does NOT do:** calculate a pay amount, apply an
overtime rate/multiplier, or send anything to a payroll system. Those all
remain entirely outside this app, exactly as they work today.

## Store closures

For when the store genuinely couldn't open at all — power cut, severe
weather, a security lockdown. This is **not** the same as a public holiday
(see `config/holidays.js`), which is informational only and never blocks
anything, because most retail stays open on holidays. A closure means the
opposite: nobody could have worked that day even if they wanted to.

| Behavior | Detail |
|---|---|
| Admin declares a closure | Any date — past (catching up a record after the fact) or future (a planned closure, e.g. renovation). Can't declare the same date twice. |
| Effect on check-in | Blocked entirely — `validationService.validateCheckIn()` fails with `STORE_CLOSED_TODAY`, checked before day-off/leave logic. |
| Effect on reporting | Anyone without an existing record that day shows as "Store closed," not "Absent," and is excluded from the Absent KPI. |
| Someone who already checked in first | Untouched — a closure only affects employees *without* a record for that date; it never rewrites an existing one. |
| Removing a closure | Fully reversible if declared by mistake — restores normal check-in/reporting behavior for that date immediately. |

Status priority when several things could apply to the same day: **approved
leave** > **store closure** > **personal day off** > absent. Approved leave
wins because it's the most specific to that individual.

## Repeated lateness

Purely informational — `reportsService.getLatenessPatterns()` flags anyone
with `SHIFT_RULES.latenessAlertThreshold` (default 3) or more late arrivals
within the *current calendar month*, listing the specific dates. Nothing is
triggered automatically — no warning, no request, no status change — it's a
heads-up for the manager to have a conversation if they choose to.

## District Manager Dashboard

A separate, higher-level view for a new role (`ROLES.DISTRICT_MANAGER`,
demo login `8000`) — distinct from the Store Manager admin view. Built as
entirely new files (`services/dmReportsService.js`, `pages/dmPage.js`,
`components/charts.js`, `components/exportExcel.js`, `css/dm.css`); nothing
in `attendanceEngine.js`, `shiftEngine.js`, or `reportsService.js` was
modified — the DM service only *reads* from the existing services (mostly
by calling `ReportsService.getFilteredRows()`/`getTodayKpis()` directly
rather than recomputing their logic).

| Piece | What it shows | Data source |
|---|---|---|
| 6 KPI cards | Total Employees, Present/Late/Absent/Off/On Leave Today | `dmReportsService.getOverviewCards()` — reuses `ReportsService.getTodayKpis()` for present/late/absent, adds off/onLeave counts not needed by the store-manager view |
| 3 charts (Chart.js) | Attendance trend, late trend, daily attendance % — last 30 days | `dmReportsService.getDailyTrend()` |
| Stores overview | Present/Late/Absent/Off/Employee count per configured store | `dmReportsService.getStoresOverview()` — groups TODAY's records by `record.store`, so a covering employee's shift correctly counts toward the store they actually worked at |
| Live employee table | Employee ID/Name, Store, Shift, Status, Check In/Out, Working Hours | `dmReportsService.getEmployeeTableRows()` |
| Filters | Date (last 30 days), Store, Employee, Shift | Applied client-side on top of the table query |
| Search | By employee ID or name | Same query, `search` param |
| Export | Filtered table → real `.xlsx` file | `components/exportExcel.js`, via SheetJS (CDN) |

**Current data scope, stated honestly:** this pilot has one real staffed
roster (`HOME_STORE` / EG222). Other configured stores show 0 employees in
the Stores Overview until they have their own roster entries — the
mechanism is correct and ready to scale, it's just not fabricating data
that doesn't exist yet. Likewise, the 30-day trend charts will be sparse
until the app has real usage history — that's expected for a fresh pilot,
not a bug.

**External libraries:** Chart.js and SheetJS are loaded via CDN
(`cdnjs.cloudflare.com`) in `index.html`, only on this one page — the
Employee and Store Manager views don't load either library.

## What's intentionally *not* a hard rule

- **Early check-in** is recorded but not blocked — arriving early is normal
  in retail and shouldn't need a manager override.
- **Overtime** is recorded but the app doesn't cap or warn about maximum
  hours — that's a policy decision for HR/store management, not something
  this pilot should silently enforce.

## Maintenance note: updating the holiday calendar

`config/holidays.js` is a static list for 2026. Islamic dates (Eid al-Fitr,
Eid al-Adha, Islamic New Year) depend on moon sighting and are only
confirmed a day or two beforehand — the dates in that file are the
government's best estimate as of when this was written. Someone needs to
check and update that file: (1) once a year for the new year's dates, and
(2) whenever an Islamic holiday's sighting-confirmed date differs from the
estimate already in the file.
