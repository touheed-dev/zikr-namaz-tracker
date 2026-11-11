// All dates in the app are local ISO strings "YYYY-MM-DD" built from date
// parts. Never use toISOString() for dates: it converts to UTC and shifts the
// day for anyone east or west of Greenwich.

const pad = (n) => String(n).padStart(2, '0');

export function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO() {
  return toISODate(new Date());
}

/** "Today" in a named IANA timezone (matches the server's user_today). */
export function todayInTimeZone(timeZone, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const get = (t) => parts.find((p) => p.type === t).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return toISODate(now);
  }
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Whole days from a to b (b - a), immune to DST because it uses UTC parts. */
export function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/** ISO weekday: Monday = 1 ... Sunday = 7 */
export function isoWeekday(iso) {
  const w = parseISO(iso).getDay();
  return w === 0 ? 7 : w;
}

export function startOfWeek(iso) {
  return addDays(iso, 1 - isoWeekday(iso));
}

export function rangeISO(from, to) {
  const out = [];
  const n = daysBetween(from, to);
  for (let i = 0; i <= n; i += 1) out.push(addDays(from, i));
  return out;
}

export function dayOfYear(iso) {
  const [y] = iso.split('-').map(Number);
  return daysBetween(`${y}-01-01`, iso) + 1;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon, 2 Nov" */
export function formatDay(iso) {
  const d = parseISO(iso);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "2 Nov" */
export function formatShort(iso) {
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function weekdayShort(iso) {
  return WEEKDAYS[parseISO(iso).getDay()];
}

export function weekdayLong(iso) {
  return WEEKDAYS_LONG[parseISO(iso).getDay()];
}

/** One-letter Mon-first labels: M T W T F S S */
export const WEEK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function weekdayLetter(iso) {
  return WEEK_LETTERS[isoWeekday(iso) - 1];
}

/** "26 Oct – 1 Nov" */
export function formatRange(from, to) {
  return `${formatShort(from)} – ${formatShort(to)}`;
}

/** Days left in the 3-day points window: 3 for today, 2, 1, then 0. */
export function windowDaysLeft(dateISO, today) {
  const age = daysBetween(dateISO, today);
  if (age < 0) return 0;
  return Math.max(0, 3 - age);
}

export function greeting() {
  return 'Assalamu Alaikum';
}
