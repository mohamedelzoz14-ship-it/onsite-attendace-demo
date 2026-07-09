/**
 * supabaseConfig.js
 * The ONLY place your Supabase project URL and anon key live.
 *
 * This is a plain static site with no build step (no Vite/Webpack/Node),
 * so there's no tool that reads a real `.env` file at build time — the
 * values below are what the browser actually receives. See
 * SUPABASE_SETUP.md at the project root for exactly where to get these
 * two values from your Supabase dashboard and why the anon key is safe
 * to have here (it's designed to be public — Row Level Security, already
 * set up in your `onsite-supabase` SQL scripts, is what actually protects
 * the data, not hiding this key).
 *
 * .env.example at the project root documents the same two values in the
 * conventional format, for reference — but this file is what the app
 * actually reads, since a browser can't read a .env file directly.
 */
export const SUPABASE_URL = "https://bwxlrgimftxksargknjl.supabase.co";       // e.g. "https://abcdefghijk.supabase.co"
export const SUPABASE_ANON_KEY = "sb_publishable_LbgcRnE72Xo79KgiItawhA_Z3TngaDF";  // Settings -> API -> Project API keys -> anon / public

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "Onsite: SUPABASE_URL / SUPABASE_ANON_KEY are empty in js/config/supabaseConfig.js — " +
    "the app cannot reach the database until these are filled in. See SUPABASE_SETUP.md."
  );
}
