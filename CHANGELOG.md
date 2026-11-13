# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-11-14

### Added
- Quran audio listening streamed from mp3quran.net public API v3.
- Curated list of 7 Hafs 'an 'Asim Murattal reciters matched at runtime: Yasser Al-Dosari (default), Mishary Rashid Alafasy, Abdul Rahman Al-Sudais, Maher Al-Muaiqly, Saad Al-Ghamdi, Mahmoud Khalil Al-Husary, and Abdul Basit Abdul Samad.
- Static dataset of all 114 Surahs (`web/src/assets/surahs.js`) with Arabic names, English titles, ayah counts (6,236 total), and revelation types (Makki/Madani), validated by unit tests.
- "Continue my khatam" listening mode with automatic progression from Surah 1 to 114, progress tracking, and debounced 15-second bookmarking.
- Friday Sunnah recitations card automatically displayed on Jumu'ah (`isoWeekday(today) === 5`) featuring Surahs Al-Kahf (18), Al-Jumu'a (62), Al-Munaafiqoon (63), Al-A'laa (87), and Al-Ghaashiya (88).
- Global mini-player bar fixed above bottom navigation with play/pause, close button, playback progress bar, and tap-to-navigate.
- Full Media Session API integration for background playback controls, lock screen metadata, artwork, track seeking, and track skipping.
- Listening time accumulation (counted only when visible or media session active) flushed periodically via `add_listen_seconds` (up to 300s per call).
- Database tables `quran_listen_progress` and `quran_listen_logs` with row-level security and `SECURITY DEFINER` RPCs (`set_listen_position`, `add_listen_seconds`, `get_listen_summary`).
- Updated `export_my_data` RPC to include `listenProgress` and `listenLogs` in the GDPR export archive.

### Security
- Quran listening is strictly private: never awards leaderboard points, never marks Quran pages as read automatically, and is never exposed to friends or global leaderboards.
- Audio streaming uses client-side fetching from mp3quran.net with Content Security Policy (`media-src` and `connect-src`) allowances in `web/vercel.json`.

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

