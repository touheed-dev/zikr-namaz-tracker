import { daysBetween } from './dates.js';
import { getItem, setItem } from './storage.js';

export const GLOBAL_LAUNCH = '2026-11-13';
export const GLOBAL_ANNOUNCE_KEY = 'zn_announce_global';

export function shouldShowGlobalAnnouncement({ today, optedIn, dismissed }) {
  const age = daysBetween(GLOBAL_LAUNCH, today);
  return age >= 0 && age < 7 && !optedIn && !dismissed;
}

export function isGlobalAnnouncementDismissed() {
  return getItem(GLOBAL_ANNOUNCE_KEY) === '1';
}

export function dismissGlobalAnnouncement() {
  setItem(GLOBAL_ANNOUNCE_KEY, '1');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('zn:announce_dismissed'));
  }
}

