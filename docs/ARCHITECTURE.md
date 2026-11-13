# Architecture & Verification

This document details the architectural decisions, security model, database schema design, and verification records for the Zikr & Namaz Tracker.

---

## 1. How the rules are enforced

All state mutations in the application go through `SECURITY DEFINER` functions in PostgreSQL (`set search_path = public`) that execute with elevated permissions, enforce `auth.uid()`, and validate every input argument. Direct `INSERT`, `UPDATE`, and `DELETE` permissions are revoked on every table for both `anon` and `authenticated` roles. Row Level Security (RLS) contains **only SELECT policies**, ensuring that even if table write permissions were inadvertently granted, direct writes would still be blocked by RLS.

### Rules Matrix

| Rule | Enforcement Location | Description |
|---|---|---|
| Local "Today" computation | `app_private.user_today` | `(now() at time zone profiles.timezone)::date`, determined strictly from the database server clock. |
| Future dates rejected | `app_private.check_log_date` | Logs dated past the user's localized "today" trigger exceptions. |
| 3-day eligibility window | `set_prayer` | Points are awarded only when `p_date >= today - 2`. Entries outside this window are recorded with 0 points. |
| Edits earn 0 points | `set_prayer`, `set_zikr` | Changing an existing record marks it `edited = true` with 0 points permanently. |
| Clearing is an edit | `set_prayer` | Unmarking a prayer sets `status = null` with `edited = true`. Rows are never physically deleted. |
| Qaza transitions | `set_prayer` | Only non-edit transitions are `missed → qaza` and `none → qaza` (+2 points once, records `qaza_at`). |
| Duplicate submissions | `set_prayer` | Submitting the same status consecutively (e.g. accidental double tap) is treated as a no-op, not an edit. |
| Daily bonuses | `app_private.points_between` | Day bonuses (+3 for completing both morning and evening azkar, +5 for all 5 daily prayers) require eligible, non-edited rows. |
| Challenge rewards | `create_challenge`, `check_challenges` | Built strictly from fixed templates with server-set rewards. Rewards are granted once per member from eligible, non-edited logs. Max 1 open challenge per template. |
| Friend privacy | `get_leaderboard`, `friend_heatmap`, `friend_quran_streak` | Friends see only display name, points, and streak by default. Heatmaps and Quran streaks require explicit opt-in. Nafl, Ramadan items, and weekly reports are strictly private. |
| No account enumeration | `send_friend_request` | Returns identical generic responses regardless of whether the invited email exists in the database. |
| Opt-in global leaderboard | `set_username`, `update_settings`, `get_global_leaderboard`, `app_private.is_user_active` | Users must set a public username (`^[a-z][a-z0-9_]{2,19}$`) and toggle `showOnGlobal = true`. Inactive users (>7 days without a prayer log in their timezone) are omitted. |
| Global leaderboard privacy | `get_global_leaderboard` | Returns only username, points, streak, and relationship status (`isMe`, `isFriend`, `requested`). Real names, emails, heatmaps, and logs are never exposed. |
| Tap-to-add friend requests | `send_friend_request_to_user`, `list_friend_requests` | Global friend requests store `via = 'global'`. Recipient emails are resolved server-side and never returned to the client. |
| User blocking | `block_user`, `unblock_user`, `list_blocked`, `friend_blocks` | Blocking wipes pending requests between both parties. Outgoing requests from blocked users return generic success responses invisibly without creating a row. |
| Quran listening privacy | `set_listen_position`, `add_listen_seconds`, `get_listen_summary` | Strictly private. Listening NEVER awards leaderboard points and never marks Quran pages as read automatically. Seconds addition capped at 300 per call and 86,400 daily. |

### Private schema (`app_private`)

Internal helper functions that operate on arbitrary user IDs (such as `points_between`, `user_today`, `is_blocked_by`, `is_user_active`, etc.) reside in the `app_private` schema. PostgREST does not expose this schema via the REST API, and execution permissions are explicitly revoked from `public`, `anon`, and `authenticated` roles.

---

## 2. Schema refinements

The following design decisions extend the base data model to ensure auditability and security:

- **`friend_requests(requester, email, via)`**: Pending requests are keyed by email address and invite type (`'email'` or `'global'`). Storing invitations to unregistered emails identically to registered accounts prevents timing and enumeration attacks. Accepted connections migrate to `friendships(requester, addressee)`, which holds canonical, unordered friendship pairs.
- **`challenges.template` and `challenges.weekdays`**: Group challenges can only be instantiated from validated templates. The server enforces target criteria, duration, and reward points. `weekdays` enables specialized recurrence (e.g. Friday Jumuah, weekend consistency).
- **`challenge_rewards(challenge_id, user_id, points, granted_on)`**: Records reward points earned by individual participants upon challenge completion, ensuring rewards register in the appropriate leaderboard scoring window.
- **`badge_defs.target` / `sort`**: Defines milestone tiers and server-side evaluation formulas ("12 / 40 days") populated directly via migrations.
- **`app_private.now()`**: Wraps the PostgreSQL `now()` timestamp. Production instances execute against the real system clock, while SQL test transactions replace this function temporarily to test edge cases across midnight and calendar year boundaries.
- **Global leaderboard (`20261113000001_global_leaderboard.sql`)**:
  - `profiles.username`: Unique case-insensitive lowercase string with regex enforcement (`^[a-z][a-z0-9_]{2,19}$`) and reserved keyword filters.
  - `friend_blocks`: Blocker-to-blocked relationship table with RLS (`blocker = auth.uid()` SELECT only) and cascade deletions.
  - `get_global_leaderboard`: Dynamically ranks the top 50 active, opted-in profiles based on period boundaries computed in the viewer's local timezone.
- **Quran listening (`20261114000001_quran_listening.sql`)**:
  - `quran_listen_progress`: Stores current listening bookmark per user (`reciter`, `surah` [1..114], `position_seconds`, `updated_at`). RLS SELECT-only for owning user (`user_id = auth.uid()`), write grants revoked from `anon` and `authenticated`.
  - `quran_listen_logs`: Daily accumulated listening duration (`user_id`, `log_date`, `seconds`, primary key `(user_id, log_date)`). RLS SELECT-only for owning user, write grants revoked.
  - `set_listen_position(p_reciter, p_surah, p_position)`: Validates surah (1..114) and position (>= 0), upserts progress for `auth.uid()`.
  - `add_listen_seconds(p_seconds)`: Validates `p_seconds` between 1 and 300, checks against daily cap (86,400s), and aggregates into `quran_listen_logs` for user's local `today`.
  - `get_listen_summary()`: Returns today's seconds, 7-day week seconds, all-time total seconds, current position bookmark, and completed khatam surah count.
  - `export_my_data`: Updated to include `listenProgress` and `listenLogs` in full data export payload.

---

## 3. Frontend notes

- **Date Handling**: All calendar calculations use local `YYYY-MM-DD` strings constructed from discrete date parts (`src/utils/dates.js`). `toISOString()` is intentionally avoided to prevent timezone shifts across Greenwich. Local "today" is derived from the profile's registered IANA timezone.
- **API Architecture**: Client functions in `src/api/*` return raw data or throw structured error objects. Expired sessions or 401 responses trigger state cleanup and redirect to `/login` with return-path preservation.
- **Optimistic UI Updates**: State changes for prayers, zikr, nafl, Quran, settings, and friend requests update optimistically with rollback and error toast notifications on network failure. In-flight requests lock repetitive button triggers.
- **Quran Audio Player**: Audio is streamed on demand from mp3quran.net public API v3 (Hafs 'an 'Asim Murattal reciters). Reciters metadata is cached in `localStorage` for 7 days. Audio element persists globally across route navigation. Background playback and lock screen controls are managed via the Media Session API. Playback position is bookmarked every 15s in Khatam mode, and listening seconds are accumulated and flushed every 60s when visible or playing via Media Session.
- **Prayer Times & Hijri Dates**: Daily prayer times are fetched from the Aladhan API in the client and cached per day in `localStorage`. Hijri dates are derived from the browser's `Intl` API using the Umm al-Qura calendar with manual offset calibration (`zn_hijri_offset`).
- **Hadith Integrity**: `src/assets/hadith.js` stores exactly 10 authentic hadith narrations. A unit test verifies SHA-256 fingerprints of every Arabic text, English translation, and source citation. Hadith selection rotates deterministically per calendar day.
- **Service Worker (`public/sw.js`)**: Supabase and third-party API requests use a network-only strategy. Document navigations follow network-first with an offline fallback page. Version-stamped asset bundles are cached cache-first.
- **Reminders**: Azan alerts, Jamaat nudges, and Azkar reminders operate as unobtrusive in-app banners while the web application is active.

---

## 4. Key assumptions

- **Leaderboard Periods**: The week runs Monday through Sunday calculated in the viewer's timezone. "This month" reflects the calendar month, while "All time" persists cumulatively.
- **Qaza Scoring**: Qaza prayers logged within the 3-day window earn +2 points. Qaza recorded after the window earns 0 points but counts toward completion streaks.
- **Full-Day Bonus (+5)**: Awarded when all 5 obligatory daily prayers (Jamaat, Alone, or eligible Qaza) are marked within the 3-day window without subsequent edits.
- **Group Challenges**: Challenge days register when all participating members complete the required target on that calendar day.
- **Head-to-Head Comparison**: Comparisons evaluate total points accumulated within the selected timeframe, indicating the equivalent Jamaat prayers (+10) required to bridge the gap.
- **Jamaat Ratio**: Computed as `(Jamaat prayers logged in past 30 days) / (Total prayers marked in past 30 days)`.
- **Target Sizes**: Interface touch targets (including Taraweeh counter blocks and dismiss buttons) strictly adhere to minimum 44px boundaries.
- **Accessibility & Contrast**: Typography contrast across all surfaces meets or exceeds WCAG AA standards (minimum 4.5:1 ratio).

---

## 5. Handover verification matrix

| Scope | Verification Status | Methodology |
|---|---|---|
| Migration Execution | Verified | Executed on PostgreSQL 16 fresh database instance via `run.sh --fresh`. |
| SQL Test Suite | Verified (200+ assertions) | Comprehensive coverage of anti-cheat rules, midnight shifts, year rollover, privacy boundaries, settings whitelists, challenges, badges, data export, and cascade deletions. |
| JavaScript Unit Tests | Verified (16 tests) | Tested with `node --test` across varying timezone environments (`TZ` values). |
| Screen Renders | Verified | Bundled via esbuild and verified in headless Chromium across all 12 core views and Ramadan mode. |
| End-to-End Suite | Verified (11 steps) | Executed with Playwright test harness against live backend RPC mocks. |
| Production Build & Lint | Verified | ESLint execution (`--max-warnings 0`) and Vite production bundle generation. |
| Hosted Supabase Services | Verified | Verified with Supabase Auth trigger simulation and remote schema deployment. |
| Aladhan API Integration | Verified | Verified parsing and fallback caching against API mock fixtures. |

