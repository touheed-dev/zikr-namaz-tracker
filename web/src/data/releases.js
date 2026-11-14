/**
 * Single source of truth for app releases and feature announcements.
 * Array ordered newest first.
 *
 * Each release:
 * - version: Semver string matching web/package.json
 * - date: YYYY-MM-DD string
 * - title: User-facing release title
 * - highlights: Array of short user-facing strings describing changes
 * - announcement?: Optional announcement card shown on Today screens:
 *     - id: Unique announcement identifier (e.g. 'prayer-times')
 *     - title: Headline for the card
 *     - body: Short summary
 *     - cta: { label: string, to: string }
 *     - icon: Icon name from Icon.jsx (e.g. 'clock', 'headphones', 'sparkle')
 *     - navDot?: Route string where a gold dot badge should appear (e.g. '/times', '/friends')
 *     - hideIf?: User settings key; hides card if user.settings[hideIf] === false (opted out)
 */

export const RELEASES = [
  {
    version: '1.5.0',
    date: '2026-11-14',
    title: "What's New & Announcements",
    highlights: [
      "Dedicated What's New screen to browse updates and new features anytime",
      'Interactive announcement carousel highlighting recent additions',
      'Clear version display and update indicators in More settings',
    ],
  },
  {
    version: '1.4.3',
    date: '2026-11-14',
    title: 'Audio playback improvements',
    highlights: [
      'Behind-the-scenes work on background audio',
    ],
  },
  {
    version: '1.4.2',
    date: '2026-11-14',
    title: 'Version info',
    highlights: [
      'App version now shown on the More page',
    ],
  },
  {
    version: '1.4.1',
    date: '2026-11-14',
    title: 'Hanafi Asr Default & Timetable Polish',
    highlights: [
      'Default Asr prayer calculation set to Hanafi jurisprudence',
      'Refined 7-day prayer timetable view with compact timings',
      'Smoother seek and skip buttons in the Quran player',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-11-14',
    title: 'Offline Prayer Times',
    announcement: {
      id: 'prayer-times',
      title: 'Offline prayer times',
      body: 'Calculate accurate daily prayer times offline with custom location and calculation methods.',
      cta: { label: 'View timetable', to: '/times' },
      icon: 'clock',
      navDot: '/times',
    },
    highlights: [
      'Accurate daily prayer times calculated completely on-device without internet',
      'Automatic location detection and global city search with privacy rounding',
      'Dedicated Prayer Times page with daily timetable and next 7 days schedule',
      'Live countdown timer to the next prayer on your Today screen',
      'Custom calculation methods (Karachi, MWL, ISNA, Umm al-Qura) and Asr madhabs',
    ],
  },
  {
    version: '1.3.2',
    date: '2026-11-14',
    title: 'Browse Quran by Juz & Seek Controls',
    highlights: [
      'Browse the Quran by 30 Juz sections or by 114 Surahs with instant search',
      'Draggable seeker progress bar and ±10s skip buttons in the mini-player',
      'Expandable Now Playing sheet with Arabic titles, reciter names, and duration',
    ],
  },
  {
    version: '1.3.1',
    date: '2026-11-14',
    title: 'Quran Listening Fixes',
    highlights: [
      'Smart rewind on resume so you never miss an ayah after pausing',
      'Accurate listening time tracking and daily Khatam progress',
      'Seamless recitation position bookmarks across devices',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-11-14',
    title: 'Quran Audio Listening',
    announcement: {
      id: 'quran-listen',
      title: 'Listen to the Quran',
      body: 'Stream beautiful recitations from curated reciters with khatam progress tracking.',
      cta: { label: 'Listen now', to: '/quran?tab=listen' },
      icon: 'headphones',
      navDot: '/quran',
    },
    highlights: [
      'Crystal-clear audio streaming from 7 renowned Hafs reciters',
      'Continue My Khatam mode with automatic surah-by-surah progression',
      'Friday Sunnah recitations card featuring Surah Al-Kahf on Jumu’ah',
      'Floating mini-player bar with convenient playback controls',
      'Strictly private listening history and progress',
    ],
  },
  {
    version: '1.2.1',
    date: '2026-11-14',
    title: 'Desktop Layout',
    highlights: [
      'Clean desktop sidebar navigation for larger screens and laptops',
      'Spacious two-column layout for Today dashboard and Ramadan tracking',
      'Optimized wide views for streak heatmaps and friend leaderboards',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-11-14',
    title: 'More Tab & Colour Themes',
    highlights: [
      'Dedicated More tab bringing settings, Nafl, and reports together',
      '7 beautiful earthy colour themes including Forest, Sage, Coffee, and Sand',
      'Instant theme preview with automatic system contrast support',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-11-13',
    title: 'Global Leaderboard',
    announcement: {
      id: 'global-leaderboard',
      title: 'Global leaderboard',
      body: 'Show yourself on the leaderboard and add friends with a tap.',
      cta: { label: 'Take a look', to: '/friends?tab=global' },
      icon: 'sparkle',
      navDot: '/friends',
      hideIf: 'showOnGlobal',
    },
    highlights: [
      'Opt-in global leaderboard with weekly, monthly, and all-time rankings',
      'Custom public usernames with privacy protection for personal data',
      'Add friends directly from the leaderboard with a single tap',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-11-11',
    title: 'Initial Release',
    highlights: [
      'Daily Namaz tracking with Jamaat, Alone, and Qaza logging',
      'Morning and Evening azkar routines with daily bonus points',
      'Quran reading log with Khatam completion tracking',
      'Private voluntary Nafl prayers tracking',
      'Friends leaderboards, streaks, and shared spiritual challenges',
      'Ramadan mode with Sehri and Iftar countdowns',
    ],
  },
];
