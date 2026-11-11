import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, daysBetween, startOfWeek, isoWeekday, todayInTimeZone, formatDay, windowDaysLeft, dayOfYear, toISODate,
} from './dates.js';
import { paraLabel, khatamProgress, quranLevel, formatPoints } from './points.js';
import { buildNamazGrid, completeDates, currentStreak, bestStreak } from './heatmap.js';
import { hijriParts, ramadanInfo } from './hijri.js';
import { formatTime12, minutesUntil, formatCountdown, parseAladhan, buildAladhanUrl } from './prayerTimes.js';

test('date maths across month and year boundaries', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2027-03-01', -1), '2027-02-28');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(daysBetween('2026-12-30', '2027-01-02'), 3);
  assert.equal(startOfWeek('2026-11-11'), '2026-11-09');
  assert.equal(startOfWeek('2026-11-15'), '2026-11-09');
  assert.equal(isoWeekday('2026-11-15'), 7);
  assert.equal(formatDay('2026-11-02'), 'Mon, 2 Nov');
  assert.equal(dayOfYear('2026-01-01'), 1);
  assert.equal(dayOfYear('2026-12-31'), 365);
  assert.equal(toISODate(new Date(2026, 0, 5)), '2026-01-05');
});

test('date maths survive DST changes', () => {
  // whole days, even across a DST switch in any TZ the test runs in
  assert.equal(daysBetween('2026-03-01', '2026-04-01'), 31);
  assert.equal(addDays('2026-03-28', 2), '2026-03-30');
  assert.equal(addDays('2026-10-24', 2), '2026-10-26');
});

test('today in a timezone near midnight (server rule mirrored)', () => {
  const t = new Date('2026-11-11T18:45:00Z');
  assert.equal(todayInTimeZone('Asia/Kolkata', t), '2026-11-12');
  assert.equal(todayInTimeZone('America/Los_Angeles', t), '2026-11-11');
  assert.equal(todayInTimeZone('Not/AZone', t).length, 10);
});

test('3-day window chips', () => {
  assert.equal(windowDaysLeft('2026-11-02', '2026-11-02'), 3);
  assert.equal(windowDaysLeft('2026-11-01', '2026-11-02'), 2);
  assert.equal(windowDaysLeft('2026-10-31', '2026-11-02'), 1);
  assert.equal(windowDaysLeft('2026-10-30', '2026-11-02'), 0);
});

test('para labels round to the nearest quarter', () => {
  assert.equal(paraLabel(5), '¼ para');
  assert.equal(paraLabel(7), '¼ para');
  assert.equal(paraLabel(10), '½ para');
  assert.equal(paraLabel(20), '1 para');
  assert.equal(paraLabel(30), '1½ para');
  assert.equal(paraLabel(31), '1½ para');
  assert.equal(paraLabel(35), '1¾ para');
  assert.equal(paraLabel(1), 'under ¼ para');
  assert.equal(paraLabel(0), '0 para');
});

test('khatam progress', () => {
  assert.deepEqual(khatamProgress(150), { completed: 0, current: 150, para: 8, percent: 25, parasDone: 7 });
  assert.equal(khatamProgress(604).completed, 1);
  assert.equal(khatamProgress(604).para, 1);
  assert.equal(khatamProgress(603).para, 30);
  assert.equal(quranLevel(0), 0);
  assert.equal(quranLevel(4), 1);
  assert.equal(quranLevel(5), 2);
  assert.equal(formatPoints(1240), '1,240');
});

test('heatmap grid, complete days and streaks', () => {
  const entries = [];
  for (const d of ['2026-11-09', '2026-11-10']) {
    for (const p of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) entries.push({ date: d, prayer: p, status: 'jamaat' });
  }
  entries.push({ date: '2026-11-11', prayer: 'fajr', status: 'qaza' });
  const g = buildNamazGrid(entries, '2026-11-11', 21);
  assert.equal(g.rows.length, 5);
  assert.equal(g.rows[0].cells.length, 21);
  assert.equal(g.rows[0].cells[20].status, 'qaza');
  assert.equal(g.rows[0].cells[0].date, '2026-10-22');
  const set = completeDates(entries);
  assert.equal(currentStreak(set, '2026-11-11'), 2, 'today not complete: count from yesterday');
  assert.equal(currentStreak(set, '2026-11-12'), 0, 'a missed day breaks the streak');
  assert.equal(bestStreak(set), 2);
});

test('hijri via Intl umalqura + offset', () => {
  const h = hijriParts('2026-02-18', 0);
  assert.ok(h.year >= 1447 && h.month >= 1 && h.month <= 12);
  const plus = hijriParts('2026-02-18', 1);
  const next = hijriParts('2026-02-19', 0);
  assert.deepEqual(plus, next, '+1 offset equals the next Gregorian day');
  // Ramadan 1447 ~ Feb/Mar 2026 under Umm al-Qura
  const r = ramadanInfo('2026-03-01', 0);
  assert.equal(r.inRamadan, true);
  assert.ok(r.day >= 1 && r.day <= 30);
  assert.ok(r.eidISO > '2026-03-01');
  assert.equal(ramadanInfo('2026-11-11', 0).inRamadan, false);
});

test('prayer time helpers', () => {
  assert.equal(formatTime12('05:20'), '5:20 am');
  assert.equal(formatTime12('12:20'), '12:20 pm');
  assert.equal(formatTime12('00:05'), '12:05 am');
  assert.equal(formatTime12('19:10'), '7:10 pm');
  const now = new Date(2026, 10, 2, 17, 45);
  assert.equal(minutesUntil('17:55', now), 10);
  assert.equal(formatCountdown(168), '2h 48m');
  assert.equal(formatCountdown(0), 'now');
  const t = parseAladhan({ data: { timings: { Fajr: '05:20 (IST)', Sunrise: '06:35', Dhuhr: '12:20', Asr: '15:40', Maghrib: '17:55', Isha: '19:10' } } });
  assert.equal(t.fajr, '05:20');
  assert.match(buildAladhanUrl({ dateISO: '2026-11-02', city: 'Mumbai', country: 'India', method: 1, asr: 'hanafi' }),
    /timingsByCity\/02-11-2026\?city=Mumbai&country=India&method=1&school=1$/);
});
