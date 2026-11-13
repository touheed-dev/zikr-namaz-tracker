# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2026-11-14

### Added
- Responsive desktop layout for screens ≥ 1100px with a fixed 240px left sidebar and wide content canvas (max-width 1120px).
- Fixed left sidebar component (`Sidebar.jsx`) displaying app branding, full navigation items (with Ramadan mode synchronization), active state indicators, Friends "new" dot, and user profile shortcut.
- Two-column responsive layout grid (`.layout-2col`) for Today (Namaz on left; Zikr, Quran today, Nafl, and Hadith on right), Ramadan mode, Track (/streak), and Friends.
- Masonry-like 2-column settings grid (`.profile-grid`) on Profile using CSS columns with `break-inside: avoid`.
- Expanded 3-4 column layout for Badges (`.badges-grid`) and 2-column layout for Weekly report (`.report-2col`).
- Focused max-width 760px single-column layout (`.page--narrow`) on desktop for More, Quran, Nafl, History, Badges, and Challenges.
- Desktop toast repositioning to the bottom-center of the main content area without mobile bottom-nav offsets.

### Changed
- Tablet breakpoint (768px–1099px): `.page` and `.bottom-nav__inner` widen to max-width 720px while retaining mobile bottom navigation.
- Pure CSS media query switching between mobile bottom navigation and desktop sidebar without JavaScript width detection or layout shift.
- Mobile viewport (< 768px) remains strictly unchanged in element ordering, touch targets, and visual presentation.

## [1.2.0] - 2026-11-14

### Added
- Dedicated **More** navigation tab (`/more`) with large, accessible rows for Profile & settings, Nafl, Log and edit, Weekly report, Badges, Challenges, and Prayer times (flagged).
- User name and `@username` heading display at the top of the More screen.
- 7 muted, solid-colour theme palettes: `forest` (default evergreen), `sage` (herbal green), `coffee` (warm brown), `slate` (cool blue-grey), `plum` (muted purple), `terracotta` (warm rust), and `sand` (light theme with warm off-white background and dark text).
- Per-device theme persistence via `localStorage` (`zn_theme`).
- Interactive Theme picker card in Profile with accessible 44px round swatches, `aria-pressed` state, visible focus rings, and live preview.
- Dynamic `<meta name="theme-color">` synchronization with active palette background, maintaining Ramadan mode override (`#0B1020`) when active.
- WCAG AA relative luminance and contrast utility (`web/src/utils/contrast.js`) and comprehensive automated test suite (`web/src/utils/themes.test.js`) verifying ≥ 4.5:1 contrast across all palettes.

### Changed
- Bottom navigation updated to 5 core tabs: Today (`/`), Track (`/streak`), Quran (`/quran`), Friends (`/friends`), and More (`/more`) in normal mode; Ramadan (`/`), 30 days (`/ramadan/map`), Quran, Friends, and More in Ramadan mode.
- More tab highlights as active whenever viewing any sub-page listed within More (`/profile`, `/nafl`, `/history`, `/report`, `/badges`, `/challenges`, `/times`).
- Relocated secondary navigation links from Profile into the dedicated More tab.

## [1.1.0] - 2026-11-13

### Added
- Opt-in global leaderboard displaying the top 50 active users by points across week, month, and all-time periods.
- Unique public usernames (`^[a-z][a-z0-9_]{2,19}$`) with case-insensitive uniqueness and reserved name validation.
- Add-friend-by-tap functionality directly from the Global tab without needing the other user's email address.
- Mutual user blocking and unblocking via `friend_blocks`, automatically purging pending requests in both directions.
- "New: Global leaderboard" dismissible banner on Today and Ramadan Today screens (active for 7 days post-launch).
- Gold dot badge on the bottom navigation "Friends" tab indicating the new feature while the announcement is unread.
- User profile toggle `showOnGlobal` (default: false), requiring a chosen username before activation.

### Changed
- `list_friend_requests`: incoming and outgoing global requests return username and hide recipient/sender email addresses.
- `export_my_data`: updated export payload to include public username, blocked users list, and outgoing request usernames for global requests.

### Security
- Privacy-first global leaderboard: email addresses, real names, heatmaps, Quran streaks, nafl logs, and weekly reports are never exposed to public view.
- Friend requests initiated by user ID resolve target emails server-side; target email addresses are never returned to the client.
- Outgoing friend requests to a user who has blocked the requester return generic success responses invisibly without creating database records.
- Enforced `SECURITY DEFINER` constraints and revoked direct table writes on `friend_blocks` and `profiles.username` for `anon` and `authenticated` roles.
- Explicit permissions revocation on internal `app_private` helper functions from public roles.

## [1.0.0] - 2026-11-11

### Added
- Namaz tracking for five daily prayers (Fajr, Dhuhr, Asr, Maghrib, Isha) with Jamaat, Alone, Missed, and Qaza logging.
- Zikr tracking for Morning and Evening azkar routines with daily completion bonus points.
- Quran logging with quarter-para precision, page count tracking, and Khatam completion progress.
- Private Nafl prayers tracking (Tahajjud, Ishraq, Duha, Awwabin, and Ramadan Taraweeh/fasts).
- Activity heatmaps and streaks with yearly grids, monthly views, and consistency calculations.
- Friends system with leaderboard rankings, head-to-head points comparisons, and shared group challenges.
- Ramadan mode featuring automatic or manual activation, Sehri/Iftar countdowns, and a 20-rakat Taraweeh tracker.
- Automated weekly spiritual progress report with breakdown metrics and tailored insights.
- System of 11 verifiable badges and milestones awarded by server-side evaluation.
- Localized prayer times computed via the Aladhan API with configurable calculation methods and Asr jurisprudence.
- Hijri calendar integration via `Intl` Umm al-Qura with manual day offset adjustment.
- Data export in JSON format and complete GDPR-compliant account deletion cascading all related records.
- Progressive Web App service worker supporting offline shell navigation and static asset caching.

### Security
- Server-side rule enforcement exclusively within PostgreSQL using `SECURITY DEFINER` RPCs (`search_path = public`).
- Enforced 3-day window for logging eligible prayers; changes to existing logs marked as edits earning zero points.
- SELECT-only Row Level Security (RLS) policies across all application tables.
- Revoked direct table modifications (`INSERT`, `UPDATE`, `DELETE`) for `anon` and `authenticated` roles.
- Friend invites keyed by email address to prevent account enumeration.

