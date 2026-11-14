import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RELEASES,
  getDismissedAnnouncementIds,
  dismissAnnouncement,
  isAnnouncementVisible,
  getActiveAnnouncements,
  getActiveNavDots,
  compareSemver,
  getLastSeenVersion,
  setLastSeenVersion,
  getUnseenReleases,
  hasUnseenReleases,
  DISMISSED_ANNOUNCEMENTS_KEY,
  LEGACY_GLOBAL_KEY,
  LAST_SEEN_VERSION_KEY,
} from './announcements.js';

// Setup mock window.localStorage for Node test runner
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  },
  dispatchEvent: () => {},
};

beforeEach(() => {
  store.clear();
});

test('releases data schema and integrity', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

  // releases[0].version matches package.json version
  assert.equal(
    RELEASES[0].version,
    pkg.version,
    `releases[0].version (${RELEASES[0].version}) matches package.json version (${pkg.version})`,
  );

  // Versions strictly descending
  for (let i = 0; i < RELEASES.length - 1; i++) {
    const cur = RELEASES[i].version;
    const next = RELEASES[i + 1].version;
    assert.ok(
      compareSemver(cur, next) > 0,
      `version ${cur} must be strictly greater than ${next}`,
    );
  }

  // Dates valid and YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  for (const rel of RELEASES) {
    assert.match(rel.date, dateRegex, `date ${rel.date} matches YYYY-MM-DD for version ${rel.version}`);
    const time = new Date(rel.date).getTime();
    assert.ok(!isNaN(time), `date ${rel.date} is valid for version ${rel.version}`);
    assert.ok(Array.isArray(rel.highlights), `highlights is array for version ${rel.version}`);
    assert.ok(rel.highlights.length > 0, `highlights has items for version ${rel.version}`);
  }

  // Announcement IDs unique
  const announcementIds = RELEASES.filter((r) => r.announcement).map((r) => r.announcement.id);
  assert.equal(
    announcementIds.length,
    new Set(announcementIds).size,
    'every announcement id must be unique',
  );

  // Specified announcements exist
  assert.ok(announcementIds.includes('prayer-times'), 'prayer-times announcement exists');
  assert.ok(announcementIds.includes('quran-listen'), 'quran-listen announcement exists');
  assert.ok(announcementIds.includes('global-leaderboard'), 'global-leaderboard announcement exists');
});

test('compareSemver ordering', () => {
  assert.equal(compareSemver('1.5.0', '1.4.3'), 1);
  assert.equal(compareSemver('1.4.0', '1.4.1'), -1);
  assert.equal(compareSemver('1.5.0', '1.5.0'), 0);
  assert.equal(compareSemver('2.0.0', '1.9.9'), 1);
  assert.equal(compareSemver('1.10.0', '1.9.0'), 1);
  assert.equal(compareSemver('1.3.1', '1.3.0'), 1);
});

test('visibility rules: 14-day window', () => {
  const ann = {
    date: '2026-11-14',
    announcement: { id: 'test-ann', title: 'Test', cta: { label: 'Go', to: '/' } },
  };

  // Same day: visible
  assert.equal(
    isAnnouncementVisible(ann, { today: '2026-11-14', dismissedIds: [] }),
    true,
    'visible on release day (age 0)',
  );

  // Day 13: visible
  assert.equal(
    isAnnouncementVisible(ann, { today: '2026-11-27', dismissedIds: [] }),
    true,
    'visible on day 13 (age 13)',
  );

  // Day 14: hidden (>= 14 days)
  assert.equal(
    isAnnouncementVisible(ann, { today: '2026-11-28', dismissedIds: [] }),
    false,
    'hidden on day 14 (age 14)',
  );

  // Before release day: hidden
  assert.equal(
    isAnnouncementVisible(ann, { today: '2026-11-13', dismissedIds: [] }),
    false,
    'hidden before release date (age < 0)',
  );
});

test('visibility rules: dismissal', () => {
  const ann = {
    date: '2026-11-14',
    announcement: { id: 'test-dismiss', title: 'Test' },
  };

  assert.equal(
    isAnnouncementVisible(ann, { today: '2026-11-14', dismissedIds: [] }),
    true,
    'visible when not dismissed',
  );

  assert.equal(
    isAnnouncementVisible(ann, { today: '2026-11-14', dismissedIds: ['test-dismiss'] }),
    false,
    'hidden when dismissed',
  );

  // Test dismissAnnouncement helper
  dismissAnnouncement('test-dismiss');
  assert.deepEqual(getDismissedAnnouncementIds(), ['test-dismiss']);
  assert.equal(
    isAnnouncementVisible(ann, { today: '2026-11-14' }),
    false,
    'hidden when dismissed in storage',
  );
});

test('visibility rules: hideIf setting', () => {
  const ann = {
    date: '2026-11-14',
    announcement: {
      id: 'test-hideif',
      title: 'Global',
      hideIf: 'showOnGlobal',
    },
  };

  // When showOnGlobal is false (opted out), it is hidden
  assert.equal(
    isAnnouncementVisible(ann, {
      today: '2026-11-14',
      user: { settings: { showOnGlobal: false } },
      dismissedIds: [],
    }),
    false,
    'hidden when user.settings.showOnGlobal is false (opted out)',
  );

  // When showOnGlobal is true, it is visible
  assert.equal(
    isAnnouncementVisible(ann, {
      today: '2026-11-14',
      user: { settings: { showOnGlobal: true } },
      dismissedIds: [],
    }),
    true,
    'visible when user.settings.showOnGlobal is true',
  );

  // When settings has no showOnGlobal, it is visible
  assert.equal(
    isAnnouncementVisible(ann, {
      today: '2026-11-14',
      user: { settings: {} },
      dismissedIds: [],
    }),
    true,
    'visible when user.settings.showOnGlobal is not false',
  );
});

test('legacy key migration: zn_announce_global = 1', () => {
  // Seed legacy key in localStorage
  store.set(LEGACY_GLOBAL_KEY, '1');

  // getDismissedAnnouncementIds should migrate and include 'global-leaderboard'
  const dismissed = getDismissedAnnouncementIds();
  assert.ok(
    dismissed.includes('global-leaderboard'),
    'migrates legacy global key to global-leaderboard dismissal',
  );

  // And the new key should be persisted
  const raw = store.get(DISMISSED_ANNOUNCEMENTS_KEY);
  assert.ok(raw, 'persisted into zn_dismissed_announcements');
  assert.deepEqual(JSON.parse(raw), ['global-leaderboard']);
});

test('nav dots calculation', () => {
  const mockReleases = [
    {
      version: '1.4.0',
      date: '2026-11-14',
      announcement: { id: 'times', navDot: '/times' },
    },
    {
      version: '1.3.0',
      date: '2026-11-14',
      announcement: { id: 'listen', navDot: '/quran' },
    },
    {
      version: '1.1.0',
      date: '2026-11-13',
      announcement: { id: 'global', navDot: '/friends', hideIf: 'showOnGlobal' },
    },
  ];

  // All active
  const activeList = getActiveAnnouncements({
    today: '2026-11-14',
    user: { settings: { showOnGlobal: true } },
    dismissedIds: [],
    releases: mockReleases,
  });
  assert.equal(activeList.length, 3, 'all 3 mock announcements are active');

  const dots1 = getActiveNavDots({
    today: '2026-11-14',
    user: { settings: { showOnGlobal: true } },
    dismissedIds: [],
    releases: mockReleases,
  });
  assert.ok(dots1.has('/times'), 'has /times dot');
  assert.ok(dots1.has('/quran'), 'has /quran dot');
  assert.ok(dots1.has('/friends'), 'has /friends dot');

  // Dismiss times
  const dots2 = getActiveNavDots({
    today: '2026-11-14',
    user: { settings: { showOnGlobal: true } },
    dismissedIds: ['times'],
    releases: mockReleases,
  });
  assert.ok(!dots2.has('/times'), 'times dismissed, no /times dot');
  assert.ok(dots2.has('/quran'), 'still has /quran dot');

  // User opted out of global (showOnGlobal: false)
  const dots3 = getActiveNavDots({
    today: '2026-11-14',
    user: { settings: { showOnGlobal: false } },
    dismissedIds: [],
    releases: mockReleases,
  });
  assert.ok(!dots3.has('/friends'), 'showOnGlobal is false, no /friends dot');
});

test('lastSeenVersion and unseen releases logic', () => {
  // 1. First-time user (lastSeen === null)
  assert.equal(getLastSeenVersion(), null);
  assert.equal(hasUnseenReleases(), true, 'first-time user has unseen releases');
  const firstTimeUnseen = getUnseenReleases();
  assert.equal(firstTimeUnseen.length, 1, 'first-time user sees only 1 release as new');
  assert.equal(firstTimeUnseen[0].version, RELEASES[0].version, 'first-time user sees newest release');

  // 2. Setting lastSeenVersion to current release
  setLastSeenVersion(RELEASES[0].version);
  assert.equal(getLastSeenVersion(), RELEASES[0].version);
  assert.equal(store.get(LAST_SEEN_VERSION_KEY), RELEASES[0].version);
  assert.equal(hasUnseenReleases(), false, 'cleared after setting current version');
  assert.deepEqual(getUnseenReleases(), [], '0 unseen releases after setting current version');

  // 3. User on older release (e.g. 1.4.0)
  const olderUnseen = getUnseenReleases('1.4.0');
  const olderVersions = olderUnseen.map((r) => r.version);
  assert.ok(olderVersions.includes('1.5.0'), 'includes 1.5.0');
  assert.ok(olderVersions.includes('1.4.3'), 'includes 1.4.3');
  assert.ok(olderVersions.includes('1.4.2'), 'includes 1.4.2');
  assert.ok(olderVersions.includes('1.4.1'), 'includes 1.4.1');
  assert.ok(!olderVersions.includes('1.4.0'), 'does not include 1.4.0 itself');
  assert.ok(!olderVersions.includes('1.3.0'), 'does not include older 1.3.0');
});
