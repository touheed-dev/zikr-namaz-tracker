import { RELEASES } from '../data/releases.js';
import { daysBetween } from './dates.js';
import { getItem, setItem } from './storage.js';

export { RELEASES };

export const DISMISSED_ANNOUNCEMENTS_KEY = 'zn_dismissed_announcements';
export const LEGACY_GLOBAL_KEY = 'zn_announce_global';
export const LAST_SEEN_VERSION_KEY = 'zn_last_seen_version';

/**
 * Returns the list of dismissed announcement IDs.
 * Automatically migrates legacy zn_announce_global = '1' -> 'global-leaderboard'.
 */
export function getDismissedAnnouncementIds() {
  let list = [];
  try {
    const raw = getItem(DISMISSED_ANNOUNCEMENTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    }
  } catch {
    list = [];
  }

  // Migrate old key: if zn_announce_global was '1', seed dismissed with 'global-leaderboard'
  try {
    const legacyGlobal = getItem(LEGACY_GLOBAL_KEY);
    if (legacyGlobal === '1' && !list.includes('global-leaderboard')) {
      list.push('global-leaderboard');
      setItem(DISMISSED_ANNOUNCEMENTS_KEY, JSON.stringify(list));
    }
  } catch {
    // ignore storage errors
  }

  return list;
}

/**
 * Dismiss a single announcement by its id and notify listeners.
 */
export function dismissAnnouncement(id) {
  if (!id) return;
  const list = getDismissedAnnouncementIds();
  if (!list.includes(id)) {
    list.push(id);
    try {
      setItem(DISMISSED_ANNOUNCEMENTS_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('zn:announce_dismissed'));
  }
}

// Backward compatibility helpers
export function isGlobalAnnouncementDismissed() {
  return getDismissedAnnouncementIds().includes('global-leaderboard');
}

export function dismissGlobalAnnouncement() {
  dismissAnnouncement('global-leaderboard');
}

/**
 * Check if a single announcement is visible.
 * - Must be within 14 days of release date relative to user_today (age >= 0 && age < 14)
 * - Must not be dismissed
 * - Must not be hidden by hideIf (e.g. hideIf: 'showOnGlobal' hides if profile.settings.showOnGlobal is false)
 */
export function isAnnouncementVisible(releaseOrAnn, { today, user, dismissedIds } = {}) {
  if (!releaseOrAnn) return false;

  let ann = releaseOrAnn;
  let date = releaseOrAnn.date;
  if (releaseOrAnn.announcement) {
    ann = releaseOrAnn.announcement;
    date = releaseOrAnn.date;
  }
  if (!ann || !ann.id) return false;

  if (date && today) {
    const age = daysBetween(date, today);
    if (age < 0 || age >= 14) return false;
  }

  const dismissed = dismissedIds !== undefined ? dismissedIds : getDismissedAnnouncementIds();
  const isDismissed = Array.isArray(dismissed)
    ? dismissed.includes(ann.id)
    : dismissed instanceof Set
      ? dismissed.has(ann.id)
      : false;
  if (isDismissed) return false;

  if (ann.hideIf && user?.settings?.[ann.hideIf] === false) {
    return false;
  }

  return true;
}

/**
 * Returns all active announcements sorted newest release first.
 */
export function getActiveAnnouncements({ today, user, dismissedIds, releases = RELEASES } = {}) {
  const dismissed = dismissedIds !== undefined ? dismissedIds : getDismissedAnnouncementIds();
  const active = [];

  for (const rel of releases) {
    if (!rel.announcement) continue;
    if (isAnnouncementVisible(rel, { today, user, dismissedIds: dismissed })) {
      active.push({
        ...rel.announcement,
        version: rel.version,
        date: rel.date,
      });
    }
  }

  return active;
}

/**
 * Returns a Set of active routes where a gold notification dot should appear.
 */
export function getActiveNavDots({ today, user, dismissedIds, releases = RELEASES } = {}) {
  const active = getActiveAnnouncements({ today, user, dismissedIds, releases });
  const dots = new Set();
  for (const a of active) {
    if (a.navDot) {
      dots.add(a.navDot);
    }
  }
  return dots;
}

/**
 * Compare two semver strings: returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal.
 */
export function compareSemver(v1, v2) {
  if (!v1 && !v2) return 0;
  if (!v1) return -1;
  if (!v2) return 1;
  const p1 = String(v1).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const p2 = String(v2).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

export function getLastSeenVersion() {
  return getItem(LAST_SEEN_VERSION_KEY);
}

export function setLastSeenVersion(version) {
  if (!version) return;
  setItem(LAST_SEEN_VERSION_KEY, version);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('zn:release_seen'));
  }
}

/**
 * Returns unseen releases.
 * For first-time users (lastSeen === null or undefined), returns only the current release (releases[0]).
 * For returning users, returns all releases strictly newer than lastSeen.
 */
export function getUnseenReleases(lastSeen = getLastSeenVersion(), releases = RELEASES) {
  if (!releases || releases.length === 0) return [];
  if (lastSeen === null || lastSeen === undefined) {
    return [releases[0]];
  }
  return releases.filter((r) => compareSemver(r.version, lastSeen) > 0);
}

export function hasUnseenReleases(lastSeen = getLastSeenVersion(), releases = RELEASES) {
  return getUnseenReleases(lastSeen, releases).length > 0;
}
