import { addDays, parseISO } from './dates.js';

const LOCALE = 'en-u-ca-islamic-umalqura-nu-latn';

let fmtNumeric;
let fmtMonth;
function formatters() {
  if (!fmtNumeric) {
    fmtNumeric = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'numeric', year: 'numeric' });
    fmtMonth = new Intl.DateTimeFormat(LOCALE, { month: 'long' });
  }
  return { fmtNumeric, fmtMonth };
}

/**
 * Hijri date for a Gregorian ISO date. `offset` (-1, 0, +1) shifts for local
 * moon sighting: +1 means the local Hijri date is one day ahead.
 */
export function hijriParts(iso, offset = 0) {
  const shifted = parseISO(addDays(iso, Number(offset) || 0));
  const { fmtNumeric: f, fmtMonth: fm } = formatters();
  const parts = f.formatToParts(shifted);
  const num = (t) => Number(parts.find((p) => p.type === t)?.value);
  return {
    day: num('day'),
    month: num('month'),
    year: num('year'),
    monthName: fm.format(shifted),
  };
}

export function formatHijri(iso, offset = 0) {
  const h = hijriParts(iso, offset);
  return `${h.day} ${h.monthName} ${h.year} AH`;
}

export function isRamadanDate(iso, offset = 0) {
  return hijriParts(iso, offset).month === 9;
}

/**
 * Info about Ramadan for a given day. When today is in Ramadan, `day` is the
 * Ramadan day number and `startISO` the Gregorian date of 1 Ramadan.
 */
export function ramadanInfo(todayIso, offset = 0) {
  const h = hijriParts(todayIso, offset);
  if (h.month !== 9) return { inRamadan: false, hijri: h };
  const startISO = addDays(todayIso, -(h.day - 1));
  let eidISO = null;
  for (let i = 1; i <= 31; i += 1) {
    const d = addDays(todayIso, i);
    const hh = hijriParts(d, offset);
    if (hh.month === 10 && hh.day === 1) {
      eidISO = d;
      break;
    }
  }
  return { inRamadan: true, day: h.day, startISO, eidISO, hijri: h };
}

/** Gregorian date for Ramadan day n (1-based) given 1 Ramadan. */
export function ramadanDayISO(startISO, n) {
  return addDays(startISO, n - 1);
}
