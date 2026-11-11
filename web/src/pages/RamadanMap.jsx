import { useToday } from '../context/AuthContext.jsx';
import { useMode } from '../context/ModeContext.jsx';
import { useNafl, useQuran } from '../hooks/useLogs.js';
import { HadithCard } from '../components/ui/HadithCard.jsx';
import { Card, LoadingBlocks, ErrorState, EmptyState } from '../components/ui/index.jsx';
import { PageHead } from '../components/layout/AppShell.jsx';
import { addDays, daysBetween, formatShort } from '../utils/dates.js';
import { formatHijri, ramadanDayISO } from '../utils/hijri.js';
import { PAGES_PER_PARA, KHATAM_PAGES } from '../utils/points.js';

const ODD = new Set([21, 23, 25, 27, 29]);

export default function RamadanMap() {
  const today = useToday();
  const { ramadan, hijriOffset } = useMode();
  const start = ramadan.inRamadan ? ramadan.startISO : addDays(today, -1);
  const end = ramadan.inRamadan ? addDays(start, 29) : today;
  const nf = useNafl(start, today);
  const qr = useQuran(start, today);

  if (!ramadan.inRamadan) {
    return (
      <>
        <PageHead title="30-day map" />
        <Card>
          <EmptyState icon="moon" title="Ramadan has not started">
            This map fills in during Ramadan: one cell per day for roza, taraweeh and Quran.
            Today is {formatHijri(today, hijriOffset)}. If your local moon sighting differs, adjust the Hijri date in Profile.
          </EmptyState>
        </Card>
        <HadithCard screen="ramadan" />
      </>
    );
  }

  if (nf.loading || qr.loading) return (<><PageHead title="30-day map" /><LoadingBlocks heights={[90, 330, 240, 80]} /></>);
  if (nf.error || qr.error) {
    return (<><PageHead title="30-day map" /><ErrorState error={nf.error || qr.error} onRetry={() => { nf.reload(); qr.reload(); }} /></>);
  }

  const elapsed = Math.min(30, ramadan.day);
  const days = Array.from({ length: 30 }, (_, i) => {
    const n = i + 1;
    const date = ramadanDayISO(start, n);
    const roza = Boolean(nf.get(date, 'ramadan:roza')?.done);
    const tar = (nf.get(date, 'ramadan:taraweeh')?.value || 0) > 0;
    const quran = qr.pagesOn(date) > 0;
    return { n, date, roza, tar, quran, count: roza + tar + quran, future: daysBetween(today, date) > 0 };
  });
  const rozaKept = days.filter((d) => d.roza && !d.future).length;
  const tarNights = days.filter((d) => d.tar && !d.future).length;
  const pages = qr.entries.filter((e) => daysBetween(start, e.date) >= 0 && daysBetween(e.date, end) >= 0).reduce((s, e) => s + e.pages, 0);
  const parasDone = Math.min(30, Math.floor(pages / PAGES_PER_PARA));
  const currentPara = Math.min(30, parasDone + 1);
  const perDay = pages / Math.max(1, elapsed);
  const finishDay = perDay > 0 ? Math.ceil(KHATAM_PAGES / perDay) : null;
  const fasterDay = Math.ceil(KHATAM_PAGES / (perDay + 1));
  const eidIn = ramadan.eidISO ? daysBetween(today, ramadan.eidISO) : null;

  return (
    <>
      <PageHead title="30-day map" />
      <div className="grid-3">
        <div className="stat"><div className="stat__value stat__value--sm">{rozaKept} / {elapsed}</div><div className="stat__label">Roza kept</div></div>
        <div className="stat"><div className="stat__value stat__value--sm">{tarNights} / {elapsed}</div><div className="stat__label">Taraweeh nights</div></div>
        <div className="stat"><div className="stat__value stat__value--sm">Para {currentPara}</div><div className="stat__label">Quran</div></div>
      </div>

      <Card title="Ibadah per day" aside="Roza + Taraweeh + Quran">
        <div className="rgrid">
          {days.map((d) => {
            const cls = ['rcell'];
            if (d.count === 3) cls.push('rcell--3');
            else if (d.count > 0) cls.push('rcell--1');
            if (ODD.has(d.n)) cls.push('rcell--odd');
            if (d.future) cls.push('rcell--future');
            return (
              <div key={d.n} className={cls.join(' ')} title={`Day ${d.n} (${formatShort(d.date)})`}
                aria-label={`Day ${d.n}: ${d.future ? 'upcoming' : `${d.count} of 3 (${[d.roza && 'roza', d.tar && 'taraweeh', d.quran && 'Quran'].filter(Boolean).join(', ') || 'none'})`}${ODD.has(d.n) ? ', odd night' : ''}`}
                role="img"
              >
                {d.n}
              </div>
            );
          })}
        </div>
        <div className="legend">
          <span className="legend__item"><span className="cell" style={{ background: 'var(--gold)', borderColor: 'var(--gold)' }} />All three</span>
          <span className="legend__item"><span className="cell" style={{ background: 'var(--teal)', borderColor: 'var(--teal)' }} />One or two</span>
          <span className="legend__item"><span className="cell" />None</span>
          <span className="legend__item"><span className="cell" style={{ boxShadow: '0 0 0 2px #F4EFE6' }} />Odd night</span>
        </div>
      </Card>

      <Card title="Khatam: 30 paras" aside={`${parasDone} done · Para ${currentPara} in progress`}>
        <div className="pgrid" role="img" aria-label={`${parasDone} of 30 paras done this Ramadan`}>
          {Array.from({ length: 30 }, (_, i) => (
            <div key={i} className={`pcell ${i < parasDone ? 'pcell--done' : i === parasDone && parasDone < 30 ? 'pcell--now' : ''}`}>{i + 1}</div>
          ))}
        </div>
        <p className="small muted">
          {finishDay
            ? (finishDay <= 30
              ? `At this pace you finish on day ${finishDay}.${fasterDay < finishDay ? ` One extra page a day makes it day ${fasterDay}.` : ''}`
              : `At this pace you finish after Ramadan (day ${finishDay}). One extra page a day makes it day ${fasterDay}.`)
            : 'Log your first pages to see when you would finish.'}
        </p>
      </Card>

      {eidIn !== null && eidIn > 0 && (
        <Card className="card--deep">
          <div className="row row--between">
            <div>
              <div className="eyebrow eyebrow--gold">Eid</div>
              <div className="strong">{eidIn} {eidIn === 1 ? 'day' : 'days'} to go</div>
            </div>
            <span className="small muted">Fitrah before Eid prayer</span>
          </div>
        </Card>
      )}
      <HadithCard screen="ramadan" />
    </>
  );
}
