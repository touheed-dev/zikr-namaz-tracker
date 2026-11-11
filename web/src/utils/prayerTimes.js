import { getJSON, setJSON, keysWithPrefix, removeItem } from './storage.js';

const CACHE_PREFIX = 'zn_pt:';

export const METHODS = [
  { id: 1, label: 'Karachi' },
  { id: 2, label: 'ISNA' },
  { id: 3, label: 'MWL' },
  { id: 4, label: 'Umm al-Qura' },
  { id: 5, label: 'Egyptian' },
];

/** "2026-11-02" -> "02-11-2026" (Aladhan's format) */
export function toAladhanDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

export function buildAladhanUrl({ dateISO, city, country, method, asr }) {
  const q = new URLSearchParams({
    city: city || 'Mumbai',
    country: country || 'India',
    method: String(method || 1),
    school: asr === 'hanafi' ? '1' : '0',
  });
  return `https://api.aladhan.com/v1/timingsByCity/${toAladhanDate(dateISO)}?${q}`;
}

const clean = (t) => (t || '').slice(0, 5); // "05:20 (IST)" -> "05:20"

export function parseAladhan(json) {
  const t = json?.data?.timings;
  if (!t) throw new Error('No prayer times in response');
  return {
    fajr: clean(t.Fajr),
    sunrise: clean(t.Sunrise),
    dhuhr: clean(t.Dhuhr),
    asr: clean(t.Asr),
    maghrib: clean(t.Maghrib),
    isha: clean(t.Isha),
  };
}

function cacheKey(opts) {
  return `${CACHE_PREFIX}${opts.dateISO}:${opts.city}:${opts.country}:${opts.method}:${opts.asr}`;
}

/** Fetch from the browser, cached per day + settings in localStorage. */
export async function getPrayerTimes(opts, { signal } = {}) {
  const key = cacheKey(opts);
  const cached = getJSON(key);
  if (cached) return cached;
  const res = await fetch(buildAladhanUrl(opts), { signal });
  if (!res.ok) throw new Error(`Prayer times unavailable (${res.status})`);
  const times = parseAladhan(await res.json());
  // keep only today's entries to stop the cache growing forever
  for (const k of keysWithPrefix(CACHE_PREFIX)) {
    if (!k.startsWith(`${CACHE_PREFIX}${opts.dateISO}:`)) removeItem(k);
  }
  setJSON(key, times);
  return times;
}

/** "05:20" -> "5:20 am" */
export function formatTime12(hhmm) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return '';
  let [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  h %= 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Minutes from `now` (a Date) until hh:mm today. Negative if past. */
export function minutesUntil(hhmm, now = new Date()) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  return Math.round((target - now) / 60000);
}

/** "2h 48m", "35m", "now" */
export function formatCountdown(mins) {
  if (mins === null || mins === undefined) return '';
  if (mins <= 0) return 'now';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
