# Zikr & Namaz Tracker

A private-by-default habit tracker for Namaz, Zikr, Quran and nafl, with streak heatmaps, a friends
leaderboard, challenges, a weekly report and a Ramadan mode.

- **Frontend:** React 18 + Vite + React Router v6, plain CSS. It is a static SPA on Vercel.
- **Backend:** Supabase only: Postgres, Auth, Row Level Security and SQL functions. There is no custom server.
  Every rule that matters (points, the 3-day window, edits, privacy, rewards) lives in Postgres, so the
  browser cannot get around it.

```
/web        Vite app (Vercel Root Directory)
/supabase   config.toml, migrations/*.sql, seed.sql, tests/*.sql
.github/workflows/ci.yml
```

---

## 1. Run it locally

You need Node 22+, Docker (for `supabase start`) and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
# 1. Database + auth (Docker)
supabase start                 # applies migrations + seed.sql (badge defs, demo users)
supabase status                # copy "API URL" and "anon key"

# 2. App
cd web
cp .env.example .env.local     # paste the API URL and anon key from `supabase status`
npm install
npm run dev                    # http://localhost:5173
```

Demo users from `seed.sql` (local only): `demo@zikr.local` / `password123` and `zaid@zikr.local` / `password123`.
Local email (password reset) shows up in Inbucket at http://localhost:54324.

### Tests

| What | Command | Needs |
|---|---|---|
| SQL tests on the Supabase stack | `./supabase/tests/run.sh` | `supabase start` |
| SQL tests on any throwaway Postgres 15+ | `DB_URL=postgresql://postgres@localhost:5432/postgres ./supabase/tests/run.sh --fresh` | a Postgres server (a temporary database is created and dropped) |
| Unit tests (dates, points, hijri, hadith integrity) | `cd web && npm test` | Node 20+ |
| Lint | `cd web && npm run lint` | `npm install` |
| Build | `cd web && npm run build` | `npm install` |
| End-to-end | `cd web && npx playwright install chromium && npm run e2e` | `supabase start` + `.env.local` (see below) |

For e2e, also export `E2E_SUPABASE_URL` and `E2E_SUPABASE_ANON_KEY`, using the same values as `.env.local`.
The e2e suite calls the REST API directly in a few places to prove the server rejects cheating.

---

## 2. Deploy (Vercel + Supabase): click by click

You do every step below in your own accounts. **Never paste the `service_role` key anywhere in the app,
in Vercel, or in a chat.** The browser only ever gets the URL and the anon key.

### 2.1 Create the Supabase project
1. https://supabase.com/dashboard → **New project**. Pick a region near your users (for India: Mumbai `ap-south-1`).
2. Set a strong database password (keep it in your password manager). Wait for the project to finish provisioning.
3. **Project Settings → General**: copy the **Reference ID** (e.g. `abcd1234efgh`).

### 2.2 Push the schema
```bash
supabase login                         # opens the browser
supabase link --project-ref <ref>      # asks for the database password
supabase db push                       # applies supabase/migrations/*.sql (seed.sql is NOT applied)
```
Check it in **Table Editor**. You should see the tables with a lock icon (RLS on), and 11 rows in `badge_defs`.

### 2.3 Auth URL configuration
**Authentication → URL Configuration**:
- **Site URL**: your Vercel production URL, e.g. `https://zikr-namaz.vercel.app`
- **Redirect URLs**: add all three:
  - `http://localhost:5173/**`
  - `https://zikr-namaz.vercel.app/**` (your production URL)
  - `https://*-<your-vercel-team-or-username>.vercel.app/**` (preview deployments)

### 2.4 Email confirmation and SMTP
**Authentication → Sign In / Providers → Email**:
- **Confirm email**: decide on or off.
  - *On* (recommended for production): after sign up the app shows "Check your email" and the user signs in from the link.
  - *Off*: users are signed in right after sign up.
- Supabase's built-in mail sender is **rate-limited** (a few emails per hour) and meant for testing only.
  For production, set **Authentication → Emails → SMTP Settings** with your own provider
  (Resend, Postmark, SES, Brevo, etc.). Password reset and confirmation depend on it.

### 2.5 Vercel
1. Push this repo to GitHub.
2. https://vercel.com/new → **Import** the repo.
3. **Root Directory**: `web`. **Framework preset**: Vite. **Build command**: `npm run build`. **Output directory**: `dist`.
4. **Environment Variables** (Production + Preview):
   - `VITE_SUPABASE_URL` = Project Settings → API → Project URL
   - `VITE_SUPABASE_ANON_KEY` = Project Settings → API → `anon` `public` key
5. **Deploy**. Then copy the production URL back into step 2.3 if it changed.

`web/vercel.json` already handles the SPA rewrites (every route → `index.html`), security headers
(CSP, HSTS, nosniff, frame-deny) and `sw.js` with `no-cache`, so new builds roll out.
**If you use a custom Supabase domain**, add it to `connect-src` in the CSP in `web/vercel.json`.

### 2.6 Post-deploy checklist
- [ ] Sign up with a real email on the production URL (and confirm it, if confirmation is on).
- [ ] Mark a prayer on Today. Reload. It is still marked and the points chip changed.
- [ ] Open the app on a second device or browser, sign up a second account, and add the first account as a friend. Accept it on the first account. Both see each other on the leaderboard.
- [ ] On the second account, open the first account from the leaderboard. The heatmap says "private" until you switch it on in Profile.
- [ ] Sign out → **Forgot password?** → the email arrives → the link opens `/reset-password` → set a new password → sign in with it.
- [ ] Profile → Export my data downloads a JSON file.
- [ ] Profile → Ramadan mode "Always on" switches the theme. Switch it back to Auto.

---

## 3. How the rules are enforced

All writes go through `SECURITY DEFINER` functions (`set search_path = public`) that use `auth.uid()`
and validate every argument. `INSERT/UPDATE/DELETE` is revoked on every table for `anon` and
`authenticated`, and RLS has **only SELECT policies**. So even if a grant slipped back in, RLS would still refuse direct writes.

| Rule | Where |
|---|---|
| "Today" = `(now() at time zone profiles.timezone)::date`, from the server clock and never the client | `app_private.user_today` |
| Future dates rejected | `app_private.check_log_date` |
| Points only for today and the previous 2 days | `set_prayer`: `eligible = p_date >= today - 2` |
| Any change to an existing entry is an edit: `edited = true`, 0 points forever | `set_prayer`, `set_zikr` |
| Clearing is an edit too (`status = null`). Rows are never deleted | `set_prayer` |
| Only non-edit transition: `missed → qaza` / `none → qaza` (+2 once, `qaza_at`) | `set_prayer` |
| Same status sent twice (a double click) is a no-op, not an edit | `set_prayer` |
| Day bonuses (+3 both azkar, +5 full day) only from eligible, non-edited rows | `app_private.points_between` |
| Friend-challenge rewards: templates only, reward set by the server, granted once, counted only from eligible, non-edited logs, and at most one open challenge per template | `create_challenge`, `check_challenges` |
| Friends see only name, points and streak. Heatmap and Quran streak only if the owner opts in. Nafl, Ramadan items and the report never | `get_leaderboard`, `friend_heatmap`, `friend_quran_streak` |
| No account enumeration: identical response for known and unknown emails | `send_friend_request` |

Helpers that take a user id (`points_between`, `user_today`, …) live in the `app_private` schema. PostgREST
does not expose that schema, and clients have no `EXECUTE` on it, so nobody can call
`points_between(<someone else>)`.

### Schema refinements (vs the minimum in the brief), and why
- **`friend_requests(requester, email)`** holds pending requests, keyed by **email**. A request to an address
  with no account is stored exactly like one to a real account, so the "Sent" list cannot be used to probe
  which emails exist. `friendships` only holds **accepted** pairs (unique per unordered pair, no self-pairs).
  When the invitee signs up later with that email, they see the request.
- **`challenges.template`** and **`challenges.weekdays`** were added. Friend challenges come only from the four templates, and the server
  sets kind, target and reward, so a client cannot create a "+1000 points for 1 day" challenge.
  `weekdays` makes "Jumuah together" count Fridays and "No-miss weekend" count Saturday and Sunday.
- **`challenge_rewards(challenge_id, user_id, points, granted_on)`** records the one-time reward per member,
  so rewards count in the leaderboard period in which they were granted.
- **`badge_defs.target` / `sort`**: progress notes ("12 / 40 days") are computed server-side from logs.
  Badge definitions live in a **migration** (production needs them). `seed.sql` repeats them idempotently.
- **`app_private.now()`** wraps `now()`. Production uses the real clock. The SQL tests replace it inside a
  rolled-back transaction to simulate midnight, year boundaries and multi-day challenges.

---

## 4. Frontend notes
- Dates are local `YYYY-MM-DD` strings built from date parts (`src/utils/dates.js`). There is no `toISOString()` for dates.
  "Today" uses the profile timezone, the same rule as the server.
- `src/api/*` keeps the contract in the brief (§6.3). Every function returns plain data or throws `Error(message)`.
  Auth errors (401 / expired JWT) clear the state and redirect to `/login`, and the user comes back to the page they wanted.
- Optimistic updates (prayers, zikr, nafl, Quran, settings, friend requests) roll back on failure and show a toast.
  A second tap on the same item is ignored while its request is in flight.
- Prayer times come from Aladhan in the browser, cached per day in `localStorage`. The Hijri date comes from `Intl` (Umm al-Qura)
  with a −1/0/+1 offset. Ramadan mode is stored in `zn_mode` and the offset in `zn_hijri_offset`.
- Hadith: `src/assets/hadith.js` holds **exactly** the 10 entries from the brief. A unit test checks a SHA-256 fingerprint
  of every Arabic and English text plus each source, so any edit fails CI. **Re-check all 10 against sunnah.com
  before public release.** Selection is deterministic per day, one card per screen at most, dismissible for the day,
  and the Profile toggle "Show hadith cards" hides them all.
- Service worker (`public/sw.js`): Supabase and other cross-origin requests are network-only, navigations are network-first with an
  offline page, and hashed assets are cache-first. Each build stamps a new version, so the new worker activates and open tabs reload once.
- Reminders (Azan alert, Jamaat nudge, Azkar reminder) are **in-app** banners on Today while the app is open.
  There are no push notifications in v1.

---

## 5. Assumptions
- The week runs Monday to Sunday in the **viewer's** timezone. "This month" is the calendar month. "All time" never resets.
  (The PDF's "Points reset weekly" line is shown as weekly *views* of the same points.)
- Qaza made up earns +2 only inside the 3-day window, like every other point. Made up later, it is recorded with 0 points.
- The full-day +5 counts jamaat, alone and qaza (+2) rows, as long as all 5 are eligible and not edited.
- Friend challenges: a day counts when **every member who joined** did it (marked within the window, not edited).
  Personal challenges count your full record. Both count days since creation, not necessarily consecutive.
- Head-to-head compares **points** (the only shared metric). It says how many Jamaat prayers (+10) close the gap.
- Jamaat % on Streak = Jamaat ÷ prayers you marked in the last 30 days.
- The PDF's "Streak freeze", "Group goal" and "prayed Isha after 10 pm" insight are left out: the spec doesn't define them
  and we don't store prayer times of day.
- Bottom nav uses the spec's 5 tabs. In Ramadan mode it is Ramadan / 30 days / Quran / Friends / Profile.
- Taraweeh blocks are 2 rows of 5 on phones (one row of 10 on wider screens) so every block is a 44px target.
- Text on the accent green is white (5.0:1) instead of cream (4.4:1), to meet the 4.5:1 contrast rule.
- Changing your timezone in settings is allowed. It can shift "today" by at most a day, which still respects the window.
- No hadith were added. No suggestions.

---

## 6. Verified / not verified (at handover)

| Item | Status | How |
|---|---|---|
| Migrations apply cleanly | Verified | Postgres 16, fresh DB, via `run.sh --fresh` |
| SQL tests (196 assertions: anti-cheat, timezone near midnight, year boundary, privacy A/B/stranger, enumeration, settings whitelist, challenges and rewards, badges, report, export, delete cascade, auth trigger) | Verified | `run.sh --fresh` on Postgres 16 |
| Unit tests (15, including hadith fingerprints, DST, 3 timezones) | Verified | `node --test` under 4 different `TZ` values |
| All 12 screens + Ramadan Today render with no console errors | Verified | esbuild bundle in headless Chromium against the real DB functions, with stand-ins for supabase-js and react-router only |
| The repo's e2e suite (11 steps) | Verified (stand-in client) | The same `e2e/app.spec.js` run against that harness |
| `npm run lint`, `npm run build` (Vite), e2e against real `supabase start` + supabase-js | **Not verified** | npm packages could not be installed in the build environment. CI runs all of them |
| Supabase-hosted specifics (auth trigger as `supabase_auth_admin`, email flows, SMTP) | **Not verified** | Needs your project. Simulated the auth role locally. Use the post-deploy checklist |
| Aladhan live responses | **Not verified** | Network blocked here. Parsing tested with a fixture |
