# Connecting Onsite to Supabase

This is the ONE remaining manual step after this migration — everything
else (every service, every page) is already written and tested against a
mock Supabase client. This just wires it to your real project.

## 1. Get your two values from Supabase

1. Open your project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. In the left sidebar, click **Project Settings** (the gear icon near the bottom).
3. Click **API** in the settings menu.
4. You'll see two values you need:
   - **Project URL** — looks like `https://abcdefghijklmno.supabase.co`
   - Under **Project API keys**, the one labeled **anon** / **public** (a long string starting with `eyJ...`)

⚠️ **Do not copy the `service_role` key** — that one grants full,
unrestricted access to your entire database with no safety checks. It must
never go in this project. Only the `anon`/`public` key belongs here.

## 2. Put them into the app

Open `js/config/supabaseConfig.js` and fill in the two empty strings:

```javascript
export const SUPABASE_URL = "https://abcdefghijklmno.supabase.co";       // your Project URL
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."; // your anon/public key
```

Save the file. That's the only file with real values in it — everything
else in the app reads from these two exports.

## 3. Run one more SQL script

You've already run `01` through `05` in the `onsite-supabase` folder. There's
one more, small one needed for login to work at all:

1. In your Supabase dashboard, go to **SQL Editor** → **New query**.
2. Open `onsite-supabase/07_auth_bridge_policy.sql`, copy the whole thing, paste it in, and click **Run**.

This doesn't change anything from the earlier scripts — it just adds one
policy that lets the app's login process work correctly with the security
rules (RLS) already in place. See the comments inside that file for exactly
why it's needed.

## 4. Also check: Anonymous sign-ins are enabled

The login bridge (see below) uses Supabase's anonymous sign-in feature.
This is usually on by default, but to confirm:

1. In your Supabase dashboard, go to **Authentication** → **Providers**.
2. Scroll to **Anonymous Sign-Ins** and make sure it's enabled (toggled on).

## 5. Re-deploy and test

Push the updated files to GitHub the same way you did before (drag the
folder in, commit). Once GitHub Pages rebuilds (usually under a minute),
open the live link and try logging in as 1001 (employee), 9000 (admin), and
8000 (District Manager) — each should load exactly like it did before,
just now reading from Supabase instead of your phone's local storage.

**The real test that matters:** check in from your phone, then open the
admin dashboard from a DIFFERENT device (or a different browser) logged in
as 9000. You should see the check-in appear — that's the multi-device
sync this whole migration was for.

---

## What "login" actually does now (worth understanding)

Nothing about the login SCREEN changed — still type an ID, any password
works, same as before. Behind the scenes, one new thing happens: the app
also creates an anonymous Supabase session and links it to that ID, which
is what lets the security rules (Row Level Security) work correctly instead
of silently blocking everything. See `onsite-supabase/07_auth_bridge_policy.sql`'s
comments for the full explanation, including the honest limit of this
approach (it doesn't add password verification — that was never part of
this app's login, and adding it is a separate, later step if you want it).

## Troubleshooting

**Blank page / console error mentioning "AuthClient" or "FunctionsHttpError" is null:**
This is a known issue with the CDN link used to load the Supabase library
(jsDelivr's `+esm` build) as of late 2025. Open `js/services/supabaseService.js`
and change the very first import line from:
```javascript
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
```
to:
```javascript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
```
Save, redeploy, and reload.

**Login screen just spins / nothing happens:**
Open the browser console (F12 → Console tab). If you see a message about
`SUPABASE_URL` or `SUPABASE_ANON_KEY` being empty, you skipped step 2 above.

**Everything loads but tables are always empty:**
Almost always means step 3 (the auth bridge script) wasn't run — RLS is
correctly blocking access because there's no verified session yet.

**"Anonymous sign-ins are disabled" error:**
See step 4 above — enable them in the Supabase dashboard.

## What did NOT change

Worth restating plainly: the UI looks and behaves identically, every
attendance rule and calculation is untouched, the folder structure is the
same, and every service kept its original name. The only things that
changed are (1) where the data actually lives, and (2) `async`/`await`
added everywhere data is read or written, since a database call takes real
time in a way `localStorage` never did.
