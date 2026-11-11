export const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

export const PRAYER_LABELS = {
  fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha',
};

export const PRAYER_LETTERS = { fajr: 'F', dhuhr: 'D', asr: 'A', maghrib: 'M', isha: 'I' };

export const STATUS_POINTS = { jamaat: 10, alone: 4, qaza: 2, missed: 0 };
export const BONUS = { bothAzkar: 3, fullDay: 5 };

export const DONE_STATUSES = ['jamaat', 'alone', 'qaza'];

export const NAFL_ITEMS = [
  { name: 'duha', label: 'Duha' },
  { name: 'tahajjud', label: 'Tahajjud' },
  { name: 'witr', label: 'Witr' },
  { name: 'sunnah', label: 'Sunnah rawatib', short: 'Sunnah' },
  { name: 'ishraq', label: 'Ishraq' },
];

const nf = new Intl.NumberFormat('en-US');

export function formatPoints(n) {
  return nf.format(Math.round(Number(n) || 0));
}

export function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// ---------------------------------------------------------------- Quran maths
export const PAGES_PER_PARA = 20;
export const KHATAM_PAGES = 604;

const FRACTIONS = { 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' };

/** Pages -> para rounded to the nearest quarter: "¼ para", "1½ para". */
export function paraLabel(pages) {
  const p = Math.max(0, Number(pages) || 0);
  if (p === 0) return '0 para';
  const quarters = Math.round((p / PAGES_PER_PARA) * 4) / 4;
  if (quarters === 0) return 'under ¼ para';
  const whole = Math.floor(quarters);
  const frac = FRACTIONS[quarters - whole];
  return `${whole > 0 ? whole : ''}${frac} para`;
}

/** Khatam progress for the current (possibly repeated) khatam. */
export function khatamProgress(totalPages) {
  const total = Math.max(0, Number(totalPages) || 0);
  const completed = Math.floor(total / KHATAM_PAGES);
  const current = total % KHATAM_PAGES;
  const para = Math.min(30, Math.floor(current / PAGES_PER_PARA) + 1);
  const percent = Math.round((current / KHATAM_PAGES) * 100);
  const parasDone = Math.min(30, Math.floor(current / PAGES_PER_PARA));
  return { completed, current, para, percent, parasDone };
}

/** Quran map shading: 0 = none, 1 = under ¼ para, 2 = ¼ para or more. */
export function quranLevel(pages) {
  if (!pages) return 0;
  return pages >= PAGES_PER_PARA / 4 ? 2 : 1;
}
