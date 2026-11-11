import { buildNamazGrid, STATUS_TEXT, zikrLevels } from '../../utils/heatmap.js';
import { PRAYER_LETTERS, PRAYER_LABELS, quranLevel } from '../../utils/points.js';
import { formatShort, rangeISO, addDays, startOfWeek, daysBetween } from '../../utils/dates.js';

export function Cell({ status, title, today, future }) {
  const cls = ['cell'];
  if (status && status !== 'missed') cls.push(`cell--${status}`);
  if (today) cls.push('cell--today');
  if (future) cls.push('cell--future');
  return <span className={cls.join(' ')} title={title} />;
}

export function NamazLegend() {
  return (
    <div className="legend" aria-label="Legend">
      <span className="legend__item"><span className="cell" />Missed or none</span>
      <span className="legend__item"><span className="cell cell--alone" />Alone</span>
      <span className="legend__item"><span className="cell cell--jamaat" />Jamaat</span>
      <span className="legend__item"><span className="cell cell--qaza" />Qaza made up</span>
    </div>
  );
}

/** 5 rows (F D A M I) x N days, oldest left. Includes a text summary for screen readers. */
export function NamazHeatmap({ entries, endISO, days = 21, today }) {
  const { dates, rows } = buildNamazGrid(entries, endISO, days);
  const counts = { jamaat: 0, alone: 0, qaza: 0 };
  rows.forEach((r) => r.cells.forEach((c) => { if (counts[c.status] !== undefined) counts[c.status] += 1; }));
  return (
    <figure style={{ margin: 0 }}>
      <div
        className="heat"
        style={{ gridTemplateColumns: `14px repeat(${dates.length}, minmax(0, 1fr))` }}
        aria-hidden="true"
      >
        {rows.map((r) => (
          <Row key={r.prayer} r={r} today={today} />
        ))}
      </div>
      <figcaption className="sr-only">
        Namaz from {formatShort(dates[0])} to {formatShort(dates[dates.length - 1])}:
        {' '}{counts.jamaat} in Jamaat, {counts.alone} alone, {counts.qaza} made up as qaza.
      </figcaption>
    </figure>
  );
}

function Row({ r, today }) {
  return (
    <>
      <span className="heat__label">{PRAYER_LETTERS[r.prayer]}</span>
      {r.cells.map((c) => (
        <Cell
          key={c.date}
          status={c.status}
          today={c.date === today}
          title={`${PRAYER_LABELS[r.prayer]} ${formatShort(c.date)}: ${STATUS_TEXT[c.status || 'none']}`}
        />
      ))}
    </>
  );
}

/**
 * Calendar heatmap for long ranges: one cell per day, Mon-Sun rows.
 * Day colour: all 5 Jamaat = Jamaat, complete with any qaza = Qaza,
 * complete otherwise = Alone, incomplete = empty.
 */
export function DayHeatmap({ entries, endISO, weeks, today }) {
  const end = addDays(startOfWeek(endISO), 6);
  const start = addDays(startOfWeek(endISO), -7 * (weeks - 1));
  const per = new Map();
  for (const e of entries) {
    const d = per.get(e.date) || { jamaat: 0, alone: 0, qaza: 0 };
    if (d[e.status] !== undefined) d[e.status] += 1;
    per.set(e.date, d);
  }
  const statusFor = (date) => {
    const d = per.get(date);
    if (!d) return null;
    const done = d.jamaat + d.alone + d.qaza;
    if (done < 5) return null;
    if (d.jamaat === 5) return 'jamaat';
    if (d.qaza > 0) return 'qaza';
    return 'alone';
  };
  const dates = rangeISO(start, end);
  let complete = 0;
  const cells = dates.map((date) => {
    const s = statusFor(date);
    if (s) complete += 1;
    return { date, s, future: daysBetween(today, date) > 0 };
  });
  return (
    <figure style={{ margin: 0 }}>
      <div
        className="heat"
        style={{ gridAutoFlow: 'column', gridTemplateRows: 'repeat(7, minmax(0, 1fr))', gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))`, gap: weeks > 20 ? 2 : 4 }}
        aria-hidden="true"
      >
        {cells.map((c) => (
          <Cell key={c.date} status={c.s} today={c.date === today} future={c.future} title={`${formatShort(c.date)}: ${c.s ? STATUS_TEXT[c.s] : 'Not complete'}`} />
        ))}
      </div>
      <figcaption className="sr-only">{complete} complete days between {formatShort(start)} and {formatShort(end)}.</figcaption>
    </figure>
  );
}

export function ZikrHeatmap({ entries, endISO, days = 21, today }) {
  const dates = rangeISO(addDays(endISO, -(days - 1)), endISO);
  const levels = zikrLevels(entries, dates);
  const both = levels.filter((l) => l.level === 2).length;
  return (
    <figure style={{ margin: 0 }}>
      <div className="heat" style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }} aria-hidden="true">
        {levels.map((l) => (
          <span
            key={l.date}
            className={`cell ${l.level ? `cell--z${l.level}` : ''} ${l.date === today ? 'cell--today' : ''}`}
            title={`${formatShort(l.date)}: ${['none', 'one set', 'both'][l.level]}`}
          />
        ))}
      </div>
      <figcaption className="sr-only">Both azkar on {both} of the last {days} days.</figcaption>
    </figure>
  );
}

/** 5 weeks x 7 days of Quran reading. */
export function QuranMap({ entries, today }) {
  const end = addDays(startOfWeek(today), 6);
  const start = addDays(end, -34);
  const per = new Map(entries.map((e) => [e.date, e.pages]));
  const dates = rangeISO(start, end);
  const lvl = ['', 'cell--z1', 'cell--z2'];
  return (
    <figure style={{ margin: 0 }}>
      <div className="heat" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }} aria-hidden="true">
        {dates.map((d) => {
          const future = daysBetween(today, d) > 0;
          return (
            <span
              key={d}
              className={`cell ${lvl[quranLevel(per.get(d))]} ${d === today ? 'cell--today' : ''} ${future ? 'cell--future' : ''}`}
              style={{ borderRadius: 6 }}
              title={`${formatShort(d)}: ${per.get(d) || 0} pages`}
            />
          );
        })}
      </div>
      <figcaption className="sr-only">
        Quran on {dates.filter((d) => per.get(d) > 0).length} of the last 35 days.
      </figcaption>
    </figure>
  );
}

/** 14-day strip for one nafl item. */
export function MiniStrip({ dates, isDone, label }) {
  const n = dates.filter(isDone).length;
  return (
    <div className="heat" style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))` }} role="img" aria-label={`${label}: ${n} of the last ${dates.length} days`}>
      {dates.map((d) => <span key={d} className={`cell ${isDone(d) ? 'cell--z1' : ''}`} title={formatShort(d)} />)}
    </div>
  );
}
