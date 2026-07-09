# Onsite — Attendance Prototype

A frontend-only attendance system for EG222 (San Stefano), built to replace
the paper attendance sheet. No visual changes were made in this refactor —
this is the same UI, rebuilt on a production-shaped architecture so a real
backend can be dropped in later without a rewrite.

## Running it

Browsers block ES modules loaded over `file://`. You need to serve the folder
over `http(s)`:

```bash
# Option A — Python's built-in server
cd onsite
python3 -m http.server 8080
# then open http://localhost:8080

# Option B — VS Code "Live Server" extension
# Option C — push the folder to GitHub Pages, exactly like your other tools
```

Demo logins: Employee `1001` or `1002` · Admin `9000` (any password works).

## Project Architecture

The app follows a layered architecture:

```
Pages (DOM + orchestration only)
   ↓ calls
Validation Service  ←  Rules (pure functions)
   ↓
Engines (Shift Engine, Attendance Engine)
   ↓
Storage Service  →  Storage Adapter (localStorage today, swappable later)
```

Plus two cross-cutting services every layer can call: **Notification
Service** (every user-facing message, one catalog) and **Audit Service**
(append-only log of logins, logouts, check-ins, check-outs, and errors).

**The rule that keeps this maintainable:** pages never compute anything —
they call a service and render what it returns. If you're tempted to write
an `if` statement about lateness, shifts, or attendance status inside a page
file, that logic belongs in `rules/shiftRules.js` or `rules/attendanceRules.js`
instead.

For the deeper technical writeup — how validation/audit/notifications fit
together, the storage adapter swap plan, and caching — see
**`docs/ARCHITECTURE.md`**. For every attendance edge case (duplicate
check-in, missing checkout, overtime, invalid shift, etc.) and exactly which
function enforces it, see **`docs/BUSINESS_RULES.md`**.

### The two engines

- **`services/shiftEngine.js`** — the Shift Engine. Answers "what shift is
  this employee on today, and were they late." Reads shift times and the
  weekly schedule from `config/shiftConfig.js` only, and delegates every rule
  decision to `rules/shiftRules.js`. Shift lookups are cached per employee/day.
- **`services/attendanceEngine.js`** — the Attendance Engine. Owns check-in,
  check-out, working hours, overtime, off-day validation, and missing-checkout
  detection — by calling `validationService.js` for the yes/no decisions and
  `auditService.js` to record what happened. Every method catches its own
  errors instead of throwing.

## Folder Structure

```
onsite/
├── index.html                 # Markup only — no inline styles or scripts
├── README.md
├── docs/
│   ├── ARCHITECTURE.md          # Validation/Audit/Notification/Storage-adapter deep dive
│   └── BUSINESS_RULES.md          # Every edge case, mapped to the function that handles it
├── css/
│   ├── variables.css           # Design tokens + global reset
│   ├── login.css                # Login screen
│   ├── shell.css                 # Sidebar, topbar, clock chip (shared)
│   ├── employee.css               # Check-in card, history table, stats
│   ├── admin.css                   # KPI cards, charts, filters
│   └── responsive.css               # Mobile/tablet breakpoints
├── js/
│   ├── main.js                 # Entry point — view routing, wires pages together
│   ├── config/
│   │   ├── constants.js         # Statuses, roles, shift types, audit events, notification codes
│   │   ├── stores.js               # Multi-store registry (coordinates, geofence radius per store)
│   │   ├── shiftConfig.js         # Shift times, weekly schedule
│   │   ├── holidays.js              # Store-wide public holiday calendar (informational, doesn't block check-in)
│   │   └── users.js                # Demo login accounts + SEED_ROSTER
│   ├── utils/
│   │   ├── dateUtils.js          # Pure date/time formatting helpers
│   │   └── domUtils.js             # byId/qs/qsa/on helpers
│   ├── rules/
│   │   ├── shiftRules.js          # Pure shift rules (late/early/overtime/day-off/valid-shift)
│   │   ├── attendanceRules.js       # Pure record rules (duplicate check-in, checkout order, etc.)
│   │   ├── requestRules.js            # Pure request rules (valid correction/leave, duplicate pending, etc.)
│   │   ├── employeeRules.js            # Pure roster rules (active/inactive, safe-to-delete)
│   │   └── closureRules.js              # Pure store-closure date validation
│   ├── services/
│   │   ├── storage/
│   │   │   └── localStorageAdapter.js   # No longer used (kept for reference/rollback) — see docs/SUPABASE_MIGRATION.md
│   │   ├── storageService.js     # Public storage API (records + audit log + requests + roster) — now delegates to supabaseService.js, async
│   │   ├── supabaseService.js      # The only file that talks to Supabase; all camelCase<->snake_case field mapping lives here
│   │   ├── shiftEngine.js          # Shift Engine (see above) — caches shift lookups, fully untouched by the Supabase migration
│   │   ├── attendanceEngine.js      # Attendance Engine (see above)
│   │   ├── requestService.js         # Submit/approve/reject for corrections + planned/sick/early leave
│   │   ├── employeeService.js          # Add/resign/transfer/reactivate/remove — the live roster
│   │   ├── closureService.js             # Declare/remove full store closures
│   │   ├── validationService.js      # Composes /rules into check-in/check-out verdicts — untouched by the Supabase migration
│   │   ├── notificationService.js      # Every user-facing message, one catalog
│   │   ├── auditService.js               # Append-only log: login/logout/check-in/out/requests/roster/errors
│   │   ├── locationService.js              # GPS geofencing + QR link validation
│   │   ├── authService.js                    # Login/logout + current session + Supabase auth-bridge linking
│   │   ├── reportsService.js                   # Admin KPI + table aggregation
│   │   └── dmReportsService.js                    # District Manager aggregation (reads only, no engine changes)
│   ├── components/
│   │   ├── clock.js              # Live ticking clock
│   │   ├── sidebar.js             # Nav active-state wiring
│   │   ├── header.js               # Topbar greeting/date
│   │   ├── card.js                  # KPI + stat card setters
│   │   ├── badge.js                  # Status pill renderer
│   │   ├── table.js                   # Generic <tbody> renderer
│   │   ├── checkInButton.js            # Check-in button visual states
│   │   ├── notifications.js             # Reusable inline banner
│   │   ├── dialog.js                     # Generic confirm dialog (not yet wired to a flow)
│   │   ├── requestDialog.js               # Missed-checkout correction request form
│   │   ├── leaveDialog.js                  # Planned/sick/early-leave request form
│   │   ├── employeeDialogs.js               # Add employee / mark resigned-transferred forms
│   │   ├── closureDialog.js                  # Declare a store closure form
│   │   ├── charts.js                           # Chart.js wrapper (District Manager dashboard only)
│   │   └── exportExcel.js                       # SheetJS Excel export (District Manager dashboard only)
│   └── pages/
│       ├── loginPage.js          # Login form wiring
│       ├── employeePage.js        # Employee dashboard wiring
│       ├── adminPage.js            # Store Manager admin dashboard wiring
│       └── dmPage.js                # District Manager dashboard wiring
└── assets/                      # (empty — for icons/images if added later)
```

## Backend: Supabase (migrated — see docs/SUPABASE_MIGRATION.md)

**Update: the plan below described a FUTURE swap. That swap happened.**
Everything reads/writes through **`storageService.js`**, which now
delegates to **`services/supabaseService.js`** instead of the old
`localStorageAdapter.js` (kept in the repo, unused, for reference/rollback).
This is exactly the seam this section always said would need to change —
see `docs/ARCHITECTURE.md` → "Storage layer" for the current state, and
`docs/SUPABASE_MIGRATION.md` for the full record of what changed, the
handful of necessary adaptations, and what was tested. **`SUPABASE_SETUP.md`**
at the project root is the one remaining manual step: putting your actual
project URL and key into `js/config/supabaseConfig.js`.

The originally-planned path (Excel Online via Power Automate) was
reconsidered in favor of Supabase for the pilot/personal-testing phase —
faster to stand up, and the storage-adapter pattern below was specifically
designed to make either backend a clean swap. The Excel/Power Automate path
remains fully documented (see `onsite-supabase/` was the SQL-side prep for
Supabase specifically) and could still be pursued for an eventual official,
company-IT-approved deployment, without re-touching any rule, engine, or page.

`config/users.js`'s `USERS` map and `config/shiftConfig.js`'s
`WEEKLY_SCHEDULE` are still hardcoded — migrating those to live data (e.g.
real login accounts, a schedule editable by the store manager) remains a
separate, later step, deliberately out of scope for "replace localStorage
reads/writes" specifically.

## What's new in this phase (Phase 1 — Requests)

Unlike the hardening pass above, this phase *does* add visible UI:
- A missed-checkout day shows a small **Fix** button that opens a correction request.
- A **Request leave** button lets an employee ask for planned time off, report
  sick leave (can be backdated), or ask to leave early today (before or
  after the fact) — one dialog, three types.
- The admin dashboard has a new **Pending Requests** panel (type-aware —
  shows all four request types) with Approve/Reject actions.
- The admin sidebar's **Employees** item is now a real screen (previously
  decorative) — add (with an optional future/past start date), mark
  resigned/transferred, reactivate, or remove people on the roster, with a
  confirm dialog before any deletion.
- A new **Overtime to confirm** panel lets the store manager mark recorded
  overtime as reviewed — a data-accuracy check, not a payroll decision;
  actual pay calculation stays entirely outside this app.
- A new **Store closures** panel lets the admin declare a date the store
  genuinely couldn't operate (power cut, weather) — unlike a holiday, this
  blocks check-in and excuses everyone without a record from "Absent."
- A new **Lateness patterns** panel flags anyone with repeated late arrivals
  this month — informational only, no automatic action.
- Public holidays no longer block check-in (an earlier version of this
  wrongly assumed "holiday = store closed"; most retail stays open on
  holidays) — they're now purely informational, flagged for holiday-pay
  reporting. Someone who genuinely isn't coming in on a holiday requests
  leave like any other day.

See `docs/BUSINESS_RULES.md` → "Request & Approval System" and "Employee
Lifecycle" for the full flows.

## What's new in this phase (Multi-store check-in)

The GPS geofence used to know about exactly one store (hardcoded). It now
checks a reading against every store in `config/stores.js` and reports
whichever one matched — solving "an employee is covering a shift at another
branch, where do they check in from?" without needing a manual store picker.
See `docs/BUSINESS_RULES.md` → "Multi-store check-in" for the full behavior
and its current scope (this is store *detection*, not yet a full separate
multi-branch deployment).

## What's new in this phase (District Manager Dashboard)

A new role (`district_manager`, demo login `8000`) with its own dashboard —
org-wide KPI cards, 30-day trend charts (Chart.js), a per-store breakdown,
a filterable/searchable live employee table, and Excel export (SheetJS).
Built entirely as new files; `attendanceEngine.js`, `shiftEngine.js`, and
`reportsService.js` were not modified — see `docs/BUSINESS_RULES.md` →
"District Manager Dashboard" for exactly how it reuses existing logic
instead of duplicating it, and its current one-store data scope.

## What's new in this phase (Supabase migration)

Every read/write that used to go to `localStorage` now goes to a real,
shared Supabase database — the actual reason for this whole migration:
before this, each device had its own separate copy of the data, so an
admin on one phone couldn't see a check-in from an employee's phone. See
`docs/SUPABASE_MIGRATION.md` for the complete technical record, and
`SUPABASE_SETUP.md` for the one remaining manual step (adding your
project's real credentials). No UI, no business rule, no attendance
calculation changed — every service kept its exact name; only `async`/
`await` was added where data is read or written.

## What's new in this phase (Phase 2 — Enterprise UI & Admin Experience)

A pure presentation-layer pass — verified against file modification
timestamps that zero business-logic files (`services/attendanceEngine.js`,
`services/shiftEngine.js`, `services/validationService.js`, any
`services/supabaseService.js`/auth/RLS code, everything in `rules/`) were
touched. Everything below is CSS, HTML structure, and component-level JS only.

- **Refined design tokens** (`css/variables.css`): sharper corners (16px→10px,
  10px→6px, 6px→4px), a warmer neutral page background, refined shadows —
  every existing component that already referenced these tokens (cards,
  panels, KPI tiles) picked up the new look automatically, with no changes
  needed to those files individually.
- **Barlow Condensed** added as a display typeface (paired with the existing
  Inter for body/data) — used for headlines, KPI numbers, section labels, and
  primary buttons throughout, for a bolder, more athletic identity consistent
  with Mohamed's other Adidas-branded work.
- **New shared `css/components.css`**: consolidates status pills and the
  notification-banner look (previously duplicated between `employee.css` and
  elsewhere) into one definition, plus genuinely new empty-state and
  loading-state styles.
- **Signature element**: elapsed shift time now renders as a bold condensed
  "track-timing" display (`.shift-clock`) instead of a plain sentence — the
  one deliberate visual flourish in the app, tied to a real functional need
  (seeing shift progress at a glance) rather than being decorative.
- **Personalized greeting** added to the Store Manager and District Manager
  dashboards (`"Good morning, Ehab"` / `"Good morning, Amr"`), matching the
  greeting the Employee dashboard already had.
- **Loading indicators**: a thin animated track bar shows during each
  dashboard's initial data fetch — meaningfully more useful now than it would
  have been pre-Supabase, since every load is a real network round-trip.
- **Better empty states**: tables with nothing to show now render an icon +
  heading + message instead of plain gray text, and distinguish "genuinely
  no data yet" from "no results for these filters".
- **Better confirmation dialogs**: consistent condensed-display titles and
  bold primary-action buttons across every dialog (corrections, leave
  requests, employee actions, store closures).
- Responsive rules got a dedicated phone-width breakpoint (separate from the
  existing tablet one), since Onsite is used primarily on a phone during a
  real shift.

## What's new in this sprint (Enterprise polish — welcome, values, quick actions)

Builds directly on Phase 2's design system — verified again via file
modification timestamps that zero business-logic files were touched.

- **3-line welcome header** on all three dashboards: a small greeting line,
  the person's full name in the display face, and their role label
  ("Sales Associate" / "Store Manager" / "District Manager") — consolidated
  `header.js`'s two near-duplicate functions into one `renderWelcomeHeader()`
  used identically everywhere, instead of three slightly different
  implementations.
- **Today's Value**: a small, quiet strip on every dashboard naming one
  workplace value per day (Teamwork, Respect, Integrity, Courage,
  Innovation, Ownership), picked deterministically from the date
  (`utils/todaysValue.js`) — no storage, no backend, purely a display touch.
- **My requests** panel added to the Employee dashboard, reusing the exact
  same `RequestService.getRequestsForEmployee()` call `renderHistory()`
  already made internally — no new service method, just a dedicated place
  to see your own request history and its status directly.
- **Quick actions** strip on the Store Manager dashboard: new buttons for
  "Add employee" and "Declare closure" that call the exact same handlers
  the existing buttons already use, plus a "View late today" shortcut that
  sets the existing status filter to "late" — new entry points to existing
  capabilities, not new capabilities.
- The District Manager's stores panel was renamed "Store comparison" (a
  text-only change) to match how it's actually used.

## What's new in this sprint (Deepening the same direction)

Explicitly a refinement pass on the previous sprint, not a redo — verified
again via file timestamps that zero business-logic files were touched.

- **Today's Value became a real card**, not a thin strip — a dark surface
  (the same one already used by the login hero and sidebar, not a new
  color), with the value name set large in the display face.
- **Team status** panel added to the Store Manager dashboard — a row of
  compact chips (initials + name + status dot) for a faster-to-scan view of
  who's in/late/absent today, using the exact same `ReportsService.getFilteredRows()`
  call the detailed table below it already makes.
- **Operational insights** added to the District Manager dashboard — 1-3
  short sentences ("3 employees late today") generated directly from the
  same KPI numbers already shown in the cards above them. This is pure text
  formatting of already-computed values in `dmPage.js` — no new service
  method, no new computation, nothing added to `dmReportsService.js`.

## What's new in this sprint ("Alive" — Operations Center, Activity Feed, executive analytics)

The most extensive UI sprint yet — still zero business-logic files touched,
verified via timestamps on every file in `js/services/` and `js/rules/`
(including `storageService.js` itself, which `dmPage.js` now reads from
directly for one chart — see below — but never modifies).

**An honest substitution, stated upfront:** "employees currently on break"
was requested but isn't a concept this system tracks anywhere — there's no
break-start/break-end anywhere in the data model. Rather than invent that
business logic (explicitly out of scope) or show fabricated data to a real
store manager, this was replaced with statuses that are real: currently
checked in, late, missing checkout, absent.

- **Animated KPI counters** (`utils/animateCounter.js`) — every KPI number
  across all three dashboards now counts up to its value instead of just
  appearing, respecting `prefers-reduced-motion`.
- **Activity feed** (`components/activityFeed.js`) added to the Store
  Manager dashboard — formats the EXISTING audit log
  (`AuditService.getLog()`, already recording every check-in, request
  decision, and admin action) into readable sentences with relative
  timestamps ("Sara checked in — 2m ago"). No new data, no new logging —
  this event data already existed and wasn't shown anywhere before.
- **Team status** + **Activity feed** + the existing KPI cards and table
  together are this sprint's answer to "Operations Center feeling" — a
  live-attendance view built from data the app already had, not a new
  dedicated screen duplicating what's already there.
- **Executive analytics**: added a **Daily / Weekly / Monthly** toggle and
  a fourth **Overtime trend** chart to the District Manager dashboard.
  Weekly/monthly views reuse `DMReportsService.getDailyTrend(days)` — a
  method that already accepted a custom day count — just fetching more days
  and rolling them into weekly/monthly buckets in the page itself (pure
  array math on data already returned, tested in isolation before shipping).
  The overtime chart reads `StorageService.getRecords()` directly (an
  existing, unmodified method) specifically so `dmReportsService.js` didn't
  need a new method — every file in `js/services/` stayed untouched.
- **A first-login welcome** (`components/onboarding.js`) for employees —
  shown once per browser (tracked in that browser's own `localStorage`,
  never sent anywhere), explaining the check-in flow in two sentences.
- A small **breadcrumb** added above the admin Employees section for
  clearer in-app navigation context.
- Premium empty states, cards, and the rest of the design system are
  unchanged from the last two sprints — this one added new panels on top
  of that same foundation rather than re-doing it.

## What's new in this sprint (Employee Directory)

The admin dashboard's existing "Employees" tab (add/mark left/reactivate/
remove — all already working) was extended, not replaced. Zero
business-logic files touched, confirmed via the same timestamp check as
every prior sprint.

- **Search, filter, sort** added above the existing employee table: search
  by ID or name, filter by store/role/status, sort by name or store.
- **Click any row to open a profile panel** — a slide-over showing employee
  ID, full name, store, role, status, join date, weekly schedule,
  attendance summary, recent attendance, and recent requests. Read-only, as
  specified — no edit controls.
- **Every field in the profile comes from an existing, unmodified service
  method** — `AttendanceEngine.getMonthSummary()`, `getWeekHours()`,
  `getHistory()`, and `RequestService.getRequestsForEmployee()` are the
  exact same methods `employeePage.js` already calls for the logged-in
  employee's own dashboard, just called here for a different `employeeId`.
  No new Supabase query, no new RLS consideration — this mirrors the same
  "admin can see their store's data" access pattern the rest of the admin
  dashboard already relies on.
- **An honest limit, stated plainly:** the roster's data model doesn't
  currently have a distinct job-title/role field (everyone is a "Sales
  Associate") or more than one staffed store — adding either would be a
  database schema change, which was explicitly out of scope this sprint.
  The Store and Role filters are fully functional and ready to scale
  automatically once that data exists; today they honestly show the one
  real value each, rather than fabricating variety that isn't there.
- Tested in isolation before shipping: 20 assertions covering the search/
  filter logic and confirming the exact field names the profile panel
  reads actually exist on what the real service methods return — this
  caught and fixed one genuine bug (wrong field names for the attendance
  summary) before it shipped.

## What's new in this sprint (Executive redesign — Damage EG222 structural benchmark)

Zero business-logic files touched, confirmed the same way as every prior
sprint. Colors stayed black/white/neutral-gray per the brief's own explicit
wording — what was adopted from the Damage EG222 reference is its
**structure**, not its navy/red/yellow/blue palette.

- **Section headers** across all 12 major panels (Team status, Activity
  feed, Pending requests, Store comparison, Operational insights, and
  more) now carry a small icon beside the title and a bolder 2px divider
  beneath — the same "icon + label + strong underline" device the
  reference uses for its section headers, in black/gray instead of color.
- **Sidebar** now has a subtle black-to-near-black gradient instead of a
  flat fill — the depth quality from the reference, kept monochrome.
- **Role-specific greeting**: District Manager gets a time-of-day greeting
  ("Good morning/afternoon/evening") since that role checks in less often;
  Store Manager and Employee both get a fixed "Welcome back", fitting
  roles that open the dashboard many times a day.
- **Authority badges** added next to the role line — "Store Operations"
  for the Store Manager, "Executive Dashboard" for the District Manager.
  Employee intentionally has no badge, keeping that experience "simple,
  focused, minimal" exactly as specified.
- **Micro-interactions**: KPI cards and info-cards now lift slightly with
  a stronger shadow on hover; found and fixed a real gap where every table
  EXCEPT the brand-new Employee Directory had no row-hover state at all —
  now consistent everywhere.
- The "Mr./Mrs." honorific from the welcome example was intentionally left
  out — there's no gender field anywhere in the data model, and adding one
  would be a database change, explicitly out of scope this sprint.

## What's new in this sprint (Structural refinements from the Damage EG222 reference)

Colors stayed black/white/gray throughout, per direct confirmation. Zero
business-logic files touched, confirmed the same way as every prior
sprint.

- **Colored top-border accent** added to the 4 main admin KPI cards
  (green/amber/red/gray, matching each card's existing icon color) —
  directly matching the reference's card anatomy.
- **Chart-type tags** ("Line", "Bar") added beside each District Manager
  chart title, matching the reference's "Clustered Bar"/"Donut" labels.
- **Export moved from a buried panel button to a prominent header-level
  action** on the District Manager dashboard — matching the reference's
  bold "AUTO REPORT" placement. Same handler, same behavior, just far more
  visible.
- **A real pre-existing issue, found and fixed**: several sidebar nav
  buttons across all three dashboards (Directory, Attendance, Reports,
  Settings on the admin sidebar; Attendance, Settings on the employee
  sidebar) had zero click handlers wired anywhere — they were decorative
  leftovers from an early mockup that did nothing when clicked. Removed
  them rather than leaving dead buttons in a tool meant to feel like a
  premium enterprise product. The admin sidebar's two real, working
  destinations (Dashboard, Employees) now sit under a small "PAGES" group
  label, matching the reference's grouped-navigation pattern.
- Verified with an added check this time: no duplicate DOM IDs anywhere,
  specifically because moving the export button risked creating one.

## What's new in this sprint (Original visual identity)

An original mark and premium login moment — no Adidas trademarks used
anywhere, confirmed by design (this was built from scratch, not adapted
from any reference image). Zero business-logic files touched.

- **A real OnSite logo**, replacing the placeholder shape that was there
  since the very first build. A ring with a small gap and a dot marking
  its start — reads as a location pin, a clock face, and a track lap all
  at once, deliberately tying to the app's own "track-timing" shift-clock
  element built earlier, so the logo and the product's own visual
  language are the same idea, not two unrelated things.
- The mark **gently rotates on the login page only** (an 8-second slow
  turn) — intentionally NOT animated in the sidebar, since a spinning
  icon is a nice first impression once, but would be a distracting
  annoyance sitting in someone's peripheral vision for an entire shift.
- **Animated abstract background** on the login hero panel: three large,
  faint outlined circles drift and gently scale on independent 32–40
  second cycles — slow and subtle by design, not a flashy effect.
  Automatically disabled for anyone with `prefers-reduced-motion` set, via
  the accessibility rule already in `variables.css`.
- **Stronger wordmark typography**: both the login page and every sidebar
  now render "Onsite" in the condensed display face with wider tracking,
  instead of the default body font it was quietly using before.
- Caught and fixed two real CSS mistakes mid-edit this turn (a dangling
  brace from a keyframe removal) before they shipped — both confirmed via
  the same brace-balance check every sprint runs.

## What's new in this sprint (Exclusive District Manager identity)

Zero business-logic files touched. `config/users.js` was touched (the DM's
display name only — display data, not business logic, matching the same
category as role labels and status text used throughout this whole
redesign).

- **Executive Brief bar** — a slim, full-bleed dark strip exists ONLY on
  the District Manager dashboard, above everything else on the page, with
  a small live pulse indicator and a one-line headline built from the
  same overview numbers already shown in the KPI cards below it.
- **A subtly darker page background**, exclusive to the DM view — a small
  but immediate visual distinction from the moment the screen loads.
- **A personal monogram watermark** behind the welcome text — computed
  from the signed-in DM's actual name (never hardcoded), extremely
  low-opacity so it never competes with real content.
- **Executive Digest**: the achievable version of "send a daily message."
  A static site has no email/SMS/push infrastructure to build on without
  new backend work, which was explicitly out of scope — so instead, the
  moment the DM logs in, a personal digest appears automatically with
  their name and the day's top 1–3 insights, reusing the exact same
  `buildInsights()` logic already built for the Operational Insights
  panel. Skipped automatically on someone's very first-ever visit so it
  doesn't stack on top of the onboarding welcome.
- **A real gap found and fixed while wiring this up**: an earlier sprint's
  notes claimed onboarding had been extended to all three roles, but the
  actual code told a different story — the Store Manager dashboard had no
  onboarding call at all, and the District Manager and Employee dashboards
  were both still calling the single-role version of the function. Fixed
  properly this time: `onboarding.js` now genuinely supports per-role
  content, and all three dashboards call it correctly.

## What's new (Real data — 5 Alexandria stores, 49 real employees)

The first real, non-demo data import — replacing the single-store pilot
with Mohamed's actual master roster across Miami (EG222), San Stefano
(EG107), Smouha (EG212), and two mall stores (EG127, EG215) pending exact
in-mall coordinates. Full technical record in
`onsite-supabase/08_real_data_migration.sql`'s own header comment.

**Tested before delivery, not just reviewed**: this migration was run
against a real PostgreSQL instance seeded to match Mohamed's actual
current state (including real attendance/request/audit history attached
to his old ID), checked for correctness on 8 separate points, then run a
**second time** to confirm it's safe to re-run without creating
duplicates — both runs produced identical, correct results.

- **Mohamed's own employee ID changed from "1001" (the original demo
  placeholder) to "1163" (his real staff ID)** — his existing attendance
  records, requests, and audit history all moved with it; nothing was
  lost. Every place in the app that referenced "1001" (login hints,
  the demo SSO button, his shift schedule) was found and updated —
  a plain text search across the whole project confirms none remain
  outside of explanatory comments.
- **Two store identities were corrected**: EG222 was mislabeled "San
  Stefano" and EG107 as an illustrative "Mall of Egypt" placeholder since
  very early in this project — both were guesses made before real store
  data existed. EG222 is actually Miami; EG107 is the real San Stefano
  branch.
- **A `title` column was added to `employees`** (Store Manager /
  Supervisor / Senior Sales / Sales Associate) — the roster never needed
  this before because the pilot data happened to be all Sales Associates.
- **4 new store managers got real admin accounts** (login codes
  9001–9004), each scoped to their own store — matching Ehab's existing
  account exactly, per Mohamed's explicit choice.
- **A genuinely important architectural finding, corrected**: the
  `weekly_schedules` Supabase table was seeded with all 43 new employees'
  shift data — but `ShiftEngine` has never actually read from that table,
  only from the hardcoded `WEEKLY_SCHEDULE` object in
  `js/config/shiftConfig.js` (a known, documented limitation from the
  original Supabase migration). Seeding the database table alone would
  NOT have made shifts work for any of the new employees — this was
  caught before delivery, and `shiftConfig.js` was updated with the same
  43 people so shift-based features (day-off detection, late/early
  calculations) actually work for them.
- **Honest, clearly-marked gaps**: employees without a real staff ID yet
  use a `<STORE>-TEMP-##` placeholder ID; EG127/EG215 use placeholder GPS
  coordinates (a real district-level guess for the other three, an
  explicit placeholder for these two) since Mohamed doesn't have their
  exact in-mall location yet; every new employee's weekly schedule is a
  reasonable rotating default, not their actual assigned shift pattern.
  All of these are meant to be swapped for real values as they become
  available — see the SQL file's own comments for exactly what to update
  and where.

## Fix — District Manager dashboard performance (the "site feels heavy" / login-fails bug)

**Symptom**: after the 5-store / 49-employee data went live, logging in as
the District Manager (8000) failed with "Something went wrong", and the
browser console showed `net::ERR_INSUFFICIENT_RESOURCES` with ~1,700+
network requests firing at once. The 401/403 errors that showed alongside
it were a *symptom*, not the cause — the browser was so starved of
connections it couldn't complete the auth-linking request either.

**Root cause** (a real, pre-existing bug that only turned fatal at real
data size): `DMReportsService.getDailyTrend()` had a days × roster nested
loop, and each inner iteration called `hasApprovedLeaveFor()` /
`isActiveEmployee()` / `isStoreClosedOn()` — every one of which re-fetched
an ENTIRE Supabase table on each call. At the old pilot size (5 employees ×
30 days ≈ 900 calls) it was slow but survived; at the new size, with the
monthly view's 180 days × 49 employees ≈ **8,800 near-simultaneous
network calls**, it exhausted the browser's connection pool and took the
whole dashboard down with it.

**The fix**: `getDailyTrend()`, `getStoresOverview()`, and
`getOverviewCards()` now fetch each table **exactly once** up front, then
apply the *same* rule functions (`RequestRules.hasApprovedLeaveFor`,
`EmployeeRules.isActiveOn`, `ClosureRules.findClosure`) in memory. The
~8,800-call trend is now a handful of queries.

**Full transparency — this is the first time a file under `js/services/`
was modified in this whole redesign.** Every prior sprint deliberately
touched only presentation. This one is a genuine exception, made because
the app was actually unusable at real data size, and because the
alternative (capping the day range in the UI) would have left the
dashboard permanently slow rather than fixing the real problem. To make
absolutely sure the change is safe, the rewritten logic was tested against
the original: both were run over identical seeded data (20 employees, 40
days of records, approved leaves, a store closure) for 7-, 30-, 84-, and
180-day windows, and asserted to produce **byte-for-byte identical
output**. The performance changed; not a single number the dashboard
displays did.

**Follow-up (same fix, one more file)**: after confirming the DM trend
was fixed, the *remaining* heaviness was traced to the same pattern in
`reportsService.js` — `getTodayKpis()` and `getFilteredRows()` both looped
over the roster calling `hasApprovedLeaveFor()` per employee (this feeds
both the DM live table AND the admin dashboard's "today" view, so it
affected both). Same fetch-once-then-filter-in-memory fix applied, and
again verified against the original with an equivalence test (scheduled
count and every synthesized row's status, both store-open and
store-closed, 30 employees — identical output). `reportsService.js` is the
second and last `js/services/` file touched, for the same reason and with
the same proof.

## Change — District Manager becomes the single oversight role (Phase 1)

The five per-store manager logins (9000–9004, incl. Ehab) were removed so
that only two roles sign in: **employees** (to check in/out) and the
**District Manager** (8000, who sees every store). This also meaningfully
lightens the app — the store-manager dashboard's per-store queries no
longer run for anyone.

- Frontend: the five accounts were removed from `js/config/users.js`
  (which is what `authService.login()` actually validates against, so
  this is what blocks their login) and every login hint updated.
- Backend: `onsite-supabase/09_remove_store_managers.sql` removes their
  `staff_accounts` rows so no orphaned login codes remain.
- **Tested before delivery**: run against a real PostgreSQL replica, which
  caught a genuine bug first time — deleting a manager triggers
  `ON DELETE SET NULL` on `audit_log.acting_login_code`, and that write is
  blocked by the audit log's append-only trigger, which made the whole
  delete fail. Fixed by lifting the trigger just for the delete and
  restoring it immediately after (same pattern as the ID migration).
  Re-tested: managers removed, all their closure/audit history preserved
  (just with null back-references — no data lost), and the append-only
  protection confirmed restored afterward.
- **Deliberately scoped**: this is Phase 1 — blocking the manager logins
  only. Giving the DM *write* powers the managers used to have (approving
  requests, adding employees) is a separate later phase that also needs
  RLS policy changes, and is intentionally NOT done yet. The admin
  dashboard code itself is left in place (harmless, unreachable) so
  restoring managers later is a small change, not a rebuild.

## Cleanup — removed the original demo/test employees

The five throwaway accounts that predated the real master-data import
(1002 Sara, 1003 Youssef, 1004 Nourhan, 1005 Karim, 1006 mohamed ahmed —
the last one added by Mohamed himself while testing) were removed so the
roster shows only real people. `onsite-supabase/10_remove_test_employees.sql`
does the database side; `js/config/users.js` and the login hints were
updated to match (Sara's 1002 login is gone). The real employees still on
temporary `EG###-TEMP-##` IDs were deliberately left untouched — those are
real people awaiting their actual staff numbers, not test data.

**Tested against a real PostgreSQL replica**, including the hardest case: a
test employee who had attendance records, a schedule, a request, and audit
entries. Confirmed all their dependent rows are removed in the right order
(attendance_records is `ON DELETE RESTRICT`, so children must go first),
real employees and the DM survive untouched, audit history is preserved
(references nulled, entries kept), and the append-only protection is
restored afterward.

## Feature — District Manager can add employees (Phases 2a/2b/2c)

The DM can now add a new employee to ANY store, choosing their store and
job title, directly from the dashboard — no more hand-written SQL for each
new hire. Built and tested in three deliberate layers:

- **2a — Security (RLS), tested first**: a new additive policy
  (`onsite-supabase/11_dm_add_employee_policy.sql`) lets a district_manager
  insert employees and their weekly schedules, unrestricted by store.
  Verified against a real PostgreSQL instance under simulated roles: the DM
  can insert to any store, a regular employee is blocked by RLS on both
  tables, and the existing store-manager policy is untouched.
- **2b — Data plumbing**: `employeeJsToRow`/`employeeRowToJs` in
  `supabaseService.js` now carry `store` (↔ home_store_id) and `title`,
  and `addEmployeeRow` uses the chosen store instead of always hardcoding
  EG222 — falling back to EG222 only when no store is given, so any older
  caller behaves exactly as before. `EmployeeService.addEmployee` takes
  optional store/title params. Verified with a mapper test (store→
  home_store_id, title passthrough, and the omitted-field fallback).
- **2c — UI**: a DM-specific add-employee dialog (store dropdown + title
  dropdown, alongside name and start date) and an "Add employee" button in
  the DM topbar, with a confirmation toast and a live refresh after adding.

Touched `supabaseService.js` and `employeeService.js` (business-logic
files) — this time for a real new capability, not just performance. The
changes are strictly additive (new optional params, new mapped fields);
every existing call path was preserved and checked.

**Still not done (future phases)**: the DM editing or removing employees,
approving requests, and declaring closures. Each needs its own RLS policy
+ test + UI, added when we reach it.

## Fix — added employees showed under the wrong store / store filter gave "no match"

After the DM could add employees to any store, adding someone to (say)
EG107 appeared to "lose" them: filtering the live table by their store
returned "no match", and they showed up mislabeled under EG222.

**Cause**: `reportsService.getFilteredRows()` builds one synthesized row
per active employee for the "today" view, and that row hardcoded
`store: HOME_STORE.id` (always EG222) — a leftover from when there was only
one store. So every employee, regardless of their real store, was labeled
EG222; filtering by any other store matched nothing. The employee was
saved correctly in the database the whole time — only the displayed store
was wrong.

**Fix**: the synthesized row now uses the employee's actual store
(`emp.store`, which the roster already carries), falling back to
HOME_STORE only if somehow unset. Verified with a test that reproduces the
exact "filter by EG107 → 0 rows" bug and confirms per-store filtering now
returns the right people.

## Fix — newly added employees didn't show in "today" (timezone bug)

Employees added in the early-morning hours (Egypt time) got a start date of
*tomorrow*, so they didn't appear in today's attendance view and looked
like they'd vanished.

**Cause**: the add-employee dialog defaulted the start date with
`new Date().toISOString().slice(0,10)` — `toISOString()` is UTC, and after
~2am Cairo time UTC has already rolled over to the next day. So "today"
became tomorrow, and `isActiveOn` correctly treats a future-dated employee
as not-active-yet.

**Fix**: the dialogs now derive today from local time (matching
`dateUtils.todayKey()`), so the default start date is always the real local
today. The same latent `toISOString` bug was fixed in the closure and leave
dialogs too, so a store closure or leave request can't accidentally land on
the wrong day either. `onsite-supabase/12_fix_future_start_dates.sql`
corrects the two employees already saved with tomorrow's date.

## Feature — District Manager can transfer, resign, and remove employees (Phase 3)

The DM can now manage the existing roster, not just add to it — via a new
"Manage" button on the dashboard that opens a roster list (all stores) with
three per-person actions:

- **Transfer** — permanently moves an employee to another store (changes
  their primary store, so they show in the new store's reports going
  forward). They stay active; past attendance records keep the store they
  were actually punched at, matching the "a shift worked at a branch counts
  for that branch" rule. A dedicated `EmployeeService.transferEmployee()`
  was added (the existing `setEmployeeStatus` only handled resignation).
- **Resign** — marks the employee as departed (sets end date + reason)
  while keeping all their history intact.
- **Remove** — fully deletes, but only for someone with zero attendance
  history; the database trigger blocks it otherwise and the UI steers you
  to Resign instead.

Built in the same three tested layers:

- **Security (RLS), tested first**: `onsite-supabase/13_dm_edit_employee_policy.sql`
  adds UPDATE + DELETE for the district_manager, unrestricted by store (a
  store-scoped policy would actually block transfers, since the update
  changes the store away from "theirs"). Verified against a real PostgreSQL
  instance with six checks: the DM can transfer, resign, and delete a
  zero-history employee; a regular employee is blocked from update and
  delete; and — critically — even the DM cannot hard-delete someone WITH
  attendance history (the zero-history trigger still fires, forcing Resign).
- **Service layer**: new `transferEmployee()`, reusing the existing
  `updateEmployeeRow` → `employeeJsToRow` path (which maps store →
  home_store_id). Two new notification codes for transfer feedback. Tested
  that transfer produces a patch touching only home_store_id (employee
  stays active) and resign sets end fields without changing store.
- **UI**: a "Manage employees" dialog (roster list + transfer/resign/remove
  per person, with a store picker for transfers and confirm prompts),
  reachable from a new DM topbar button, with toast feedback and live
  refresh.

Also settled with no work needed: an employee **supporting another branch**
temporarily just punches in there and it counts for that branch — which is
exactly the current behavior, so no change was required.

**Still not done (future phases)**: the DM approving requests and declaring
closures. Each remains its own RLS policy + test + UI.

## Fix — "Remove employee" failed with "something went wrong"

Removing a newly-added employee always failed. **Cause**: every employee
added through the app gets an `EMPLOYEE_ADDED` row in `audit_log` pointing
at them, and that column is `ON DELETE SET NULL` — so deleting the employee
made Postgres automatically run an UPDATE on `audit_log` to null the
reference, which the append-only trigger blocked, failing the whole delete.
Since every app-added employee has such a row, Remove failed for
essentially all of them (only ever surfacing as a generic error).

**Fix** (`onsite-supabase/14_audit_allow_fk_null.sql`): the append-only
trigger now distinguishes *content edits* (still fully blocked — event
type, details, timestamp, id) from the automatic *foreign-key detach*
(nulling employee_id / acting_login_code when the referenced row is
deleted), which it now permits. Deletes of audit rows themselves stay
blocked, and normal audit logging is unaffected. Verified against a real
PostgreSQL replica: the employee delete now succeeds (audit entry kept,
reference nulled), while content edits and audit-row deletes remain
blocked.

## Scaling — search in the Manage employees dialog

Anticipating growth from ~50 to a much larger roster, the Manage dialog now
has a live search box (filter by name, ID, or store as you type). It works
by toggling visibility on already-rendered rows, so it stays instant at
hundreds or thousands of employees. The Add dialog's store dropdown and the
main table's store filter already scoped things by store, so this closes
the remaining gap.

## Fix — "Remove" showed a false "something went wrong" (the delete actually worked)

After the database-side remove fix, removing an employee still popped
"something went wrong" — but refreshing showed the employee *was* deleted.
So the delete succeeded and only the feedback was wrong.

**Cause**: `removeEmployee` deleted the employee first, then wrote an
`EMPLOYEE_REMOVED` audit entry that referenced the (now-deleted) employee's
id via a foreign key — which threw, and the catch turned it into a generic
error even though the delete had already committed.

**Fix** (code only — no new SQL): the removal is now logged *before* the
delete, and the audit entry records the removed person's id and name in its
details payload (`removedEmployeeId` / `removedName`) instead of the
foreign-key column. So there's no dangling reference, no error — and the
audit trail is actually better now, permanently keeping the name of whoever
was removed even after they're gone from the roster. Verified end-to-end
against a real PostgreSQL replica: log-then-delete completes with no error,
the employee is gone, and both the add and remove audit entries survive.

## Feature — District Manager can approve/reject employee requests (Phase 4)

The DM can now review pending requests (leave, sick, early-leave, missed-
checkout corrections) from any store, via a new "Requests" button in the
topbar that carries a live count badge of how many are pending.

- **Security (RLS), tested first**: `onsite-supabase/15_dm_review_requests_policy.sql`
  adds two policies — the DM can UPDATE `requests` (the approve/reject
  itself) and UPDATE `attendance_records` (because approving a
  missed-checkout or early-leave request writes the correction onto the
  underlying attendance record). Both unrestricted by store. Verified
  against a real PostgreSQL instance: the DM can review requests and
  correct attendance; a regular employee is blocked from both; the
  store-manager policies are untouched.
- **Service layer — no changes needed**: `approveRequest`, `rejectRequest`,
  and `getPendingRequests` already existed (from the old admin path) and
  are store-agnostic (they act on a request by id), so the DM reuses them
  as-is. This approval logic already handles the tricky parts — e.g. a
  missed-checkout approval recomputes worked/overtime hours and re-derives
  the correct present/late status rather than blindly clearing "missing".
- **UI**: a pending-requests dialog listing each request with the
  requester, their store, type, date, and any note, plus Approve/Reject
  buttons; a topbar button with a red pending-count badge that refreshes on
  load and after every action.

**Still not done (the last planned phase)**: the DM declaring store
closures. Same RLS + test + UI approach when we reach it.

## Redesign — premium login + a lime accent across the app

Inspired by a Stitch reference Mohamed shared, the look was elevated toward
a premium, athletic Adidas feel — using the project's own electric-lime
accent (#D4FF00) rather than the reference's blue.

- **Login page** was rebuilt as a full-bleed dark hero: a slowly drifting
  gradient backdrop, animated Adidas-style three-stripes, a breathing lime
  glow, and a floating glass sign-in card that rises in on load. Big
  condensed uppercase headline with a lime underline; the sign-in button is
  lime with a soft glow. Every id/class the JS depends on (loginForm,
  empId, empPass, loginError, msBtn, brand/copy classes) was preserved —
  only the styling changed. A `--login-bg-image` slot is provided so a real
  photo can be dropped in later without touching anything else. "222 Stores"
  became "You got this".
- **Internal screens** kept their light, data-friendly backgrounds (better
  for daily reading of tables) but gained the premium touches: lime sidebar
  branding + a lime edge on the active nav item, a lime glow ring on the
  employee check-in button, and softer/deeper shadows. Done by adding a
  `--lime` token family in `variables.css` (the existing `--green` status
  color is untouched, so pills stay legible) and light edits to shell and
  employee CSS — every change is additive and every stylesheet stayed
  brace-balanced.

## Redesign continued — animated dark backdrops + DM welcome splash

Extending the premium look to the two dashboards Mohamed uses most:

- **DM and Employee dashboards** now sit on the same animated dark backdrop
  as the login (drifting gradient + a breathing lime glow), while their
  cards, tables, and topbars stay light and float above it as bright panels
  — the "dark background, light cards" look Mohamed chose. The DM and
  employee topbars became light floating panels so their existing dark text
  stays readable; every content block (KPI cards, chart panels, check-in
  card) already had its own background, so nothing became unreadable.
  Backgrounds are `background-attachment:fixed` so they stay put while
  content scrolls.
- **"Welcome, Mr Ahmed" splash**: when the DM opens the dashboard, a brief
  full-screen greeting fades/rises in with a lime underline sweep, then
  dissolves after ~2 seconds — greeting them by their real first name
  (never hardcoded). It respects `prefers-reduced-motion` (skipped if the
  user asked the OS to reduce motion) and doesn't block anything.

All changes are CSS plus one self-contained splash function; every
stylesheet stayed brace-balanced, all JS passed syntax checks, and every
JS-referenced DOM id still resolves.

## Redesign — Aurora animated background

The dashboard backdrop was reworked into an "Aurora" effect at Mohamed's
request (the earlier drift was too subtle and the colors too dark): a
northern-lights field of electric-lime and violet radial waves that
visibly drift, rotate, and scale over a deep dark base, blurred for a soft
glow. Faster, clearly-alive motion (~14s loop with real position/rotation/
scale changes, not just opacity). Applied to both the DM and employee
dashboards; cards, tables, and topbars stay light and float above it.
Respects `prefers-reduced-motion`. The keyframes are duplicated in dm.css
and shell.css so each view is self-sufficient regardless of load order.

## What stayed exactly the same

Per the brief, no UI or feature changed in this refactor, and no UI or
feature changed in the later hardening pass either — validation, the audit
log, notifications, caching, and the storage adapter are all internal-quality
work with zero visual difference:
- Check In / Check Out, live shift timer, GPS + QR verification
- Weekly per-employee shift schedule (Morning / Afternoon / Extended Thu-Fri / Off)
- Missing check-out auto-detection
- Employee history + monthly/weekly stats
- Admin KPIs, filters, and attendance table
