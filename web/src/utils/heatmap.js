import { addDays, rangeISO, daysBetween } from './dates.js';
import { PRAYERS, DONE_STATUSES } from './points.js';

export const HEAT_COLORS = {
  jamaat: '#1A7F45',
  alone: '#8FD3A8',
  qaza: '#E9C46A',
};

export const STATUS_TEXT = {
  jamaat: 'Jamaat', alone: 'Alone', qaza: 'Qaza made up', missed: 'Missed', none: 'Not marked',
};

/** Index entries [{date, prayer, status}] by "date|prayer". */
export function indexByDatePrayer(entries) {
  const map = new Map();
  for (const e of entries || []) {
    if (e.status) map.set(`${e.date}|${e.prayer}`, e);
  }
  return map;
}

/** Rows F D A M I, columns oldest -> newest ending at endISO. */
export function buildNamazGrid(entries, endISO, days) {
  const from = addDays(endISO, -(days - 1));
  const dates = rangeISO(from, endISO);
  const map = indexByDatePrayer(entries);
  const rows = PRAYERS.map((prayer) => ({
    prayer,
    cells: dates.map((date) => ({ date, status: map.get(`${date}|${prayer}`)?.status || null })),
  }));
  return { dates, rows };
}

export function completeDates(entries) {
  const counts = new Map();
  for (const e of entries || []) {
    if (DONE_STATUSES.includes(e.status)) counts.set(e.date, (counts.get(e.date) || 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n === 5).map(([d]) => d));
}

/**
 * Consecutive days ending today (or yesterday if today is not done yet).
 * Mirrors the SQL rule so the UI can update instantly after a tap.
 */
export function currentStreak(dateSet, today) {
  let start = dateSet.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (dateSet.has(start)) {
    n += 1;
    start = addDays(start, -1);
  }
  return n;
}

export function bestStreak(dateSet) {
  const sorted = [...dateSet].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of sorted) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Zikr heatmap level per day: 0 none, 1 one set, 2 both. */
export function zikrLevels(entries, dates) {
  const per = new Map();
  for (const e of entries || []) {
    if (e.done) per.set(e.date, (per.get(e.date) || 0) + 1);
  }
  return dates.map((date) => ({ date, level: Math.min(2, per.get(date) || 0) }));
}
