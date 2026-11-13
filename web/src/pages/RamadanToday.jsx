import { Link } from 'react-router-dom';
import { useToday } from '../context/AuthContext.jsx';
import { useMode } from '../context/ModeContext.jsx';
import { useNafl, useQuran } from '../hooks/useLogs.js';
import { usePrayerTimes } from '../hooks/usePrayerTimes.js';
import { useNow } from '../hooks/useNow.js';
import { HadithCard } from '../components/ui/HadithCard.jsx';
import { GlobalAnnouncementCard } from '../components/ui/GlobalAnnouncementCard.jsx';
import { Card, Icon, ErrorState, Skeleton } from '../components/ui/index.jsx';
import { formatTime12, minutesUntil, formatCountdown } from '../utils/prayerTimes.js';
import { khatamProgress, paraLabel } from '../utils/points.js';
import { formatHijri } from '../utils/hijri.js';
import { addDays } from '../utils/dates.js';

const ODD_NIGHTS = [21, 23, 25, 27, 29];

function IftarCard({ times, timesError, now }) {
  if (timesError) {
    return <Card><p className="small muted">Prayer times are unavailable right now, so the iftar countdown is hidden. Check your city in Profile.</p></Card>;
  }
  if (!times) return <Skeleton height={190} />;
  const toIftar = minutesUntil(times.maghrib, now);
  const toFajr = minutesUntil(times.fajr, now);
  const toSunrise = minutesUntil(times.sunrise || times.fajr, now);
  const span = Math.max(1, toIftar - toSunrise); // minutes from sunrise to iftar
  const progress = Math.min(1, Math.max(0, -toSunrise / span));
  // dot on the arc from sunrise (left) to iftar (right)
  const x = 10 + progress * 280;
  const y = 76 - Math.sin(progress * Math.PI) * 60;

  return (
    <Card className="card--deep">
      <div className="row row--between">
        <span className="eyebrow">{toIftar > 0 ? 'Iftar in' : 'Iftar was at'}</span>
        <span className="small muted">
          {toFajr > 0 ? `Sehri ends ${formatTime12(times.fajr)}` : `Sehri ended ${formatTime12(times.fajr)}`}
        </span>
      </div>
      <div className="countdown__big" aria-live="off">{toIftar > 0 ? formatCountdown(toIftar) : formatTime12(times.maghrib)}</div>
      <svg className="arc" viewBox="0 0 300 86" aria-hidden="true" preserveAspectRatio="none">
        <path d="M10 76 Q150 -44 290 76" fill="none" stroke="var(--line)" strokeWidth="2" strokeDasharray="4 5" />
        <circle cx={x} cy={y} r="7" fill="var(--gold)" />
      </svg>
      <div className="row row--between small muted">
        <span>Sunrise {formatTime12(times.sunrise)}</span>
        <span className="strong" style={{ color: 'var(--text)' }}>Iftar {formatTime12(times.maghrib)}</span>
      </div>
    </Card>
  );
}

function Tile({ label, sub, done, onClick, disabled }) {
  return (
    <button type="button" className="tile" aria-pressed={done} onClick={onClick} disabled={disabled}>
      <span className="row row--between" style={{ width: '100%' }}>
        <span className="strong">{label}</span>
        <span className="tile__check">{done && <Icon name="check" size={14} strokeWidth={3} />}</span>
      </span>
      <span className="small muted">{sub}</span>
    </button>
  );
}

export default function RamadanToday() {
  const today = useToday();
  const now = useNow(30000);
  const { ramadan, hijriOffset } = useMode();
  const nf = useNafl(today, today);
  const qr = useQuran(ramadan.inRamadan ? ramadan.startISO : addDays(today, -29), today);
  const { times, error: timesError } = usePrayerTimes(today);

  const get = (n) => nf.get(today, n);
  const isDone = (n) => Boolean(get(n)?.done);
  const toggle = (n) => nf.set(today, n, !isDone(n)).catch(() => {});
  const rakats = get('ramadan:taraweeh')?.value || 0;
  const setRakats = (v) => nf.set(today, 'ramadan:taraweeh', v > 0, Math.max(0, Math.min(20, v))).catch(() => {});
  const tapBlock = (i) => {
    const filled = rakats / 2;
    // tapping the last filled block steps back by one block
    if (i === filled - 1) setRakats(rakats - 2);
    else setRakats((i + 1) * 2);
  };

  const day = ramadan.inRamadan ? ramadan.day : null;
  const afterMaghrib = times ? minutesUntil(times.maghrib, now) <= 0 : false;
  const nightNow = day ? (afterMaghrib ? day + 1 : day) : null;
  const pagesToday = qr.pagesOn(today);
  const ramadanPages = qr.entries.reduce((n, e) => n + e.pages, 0);
  const k = khatamProgress(ramadanPages);
  const busy = (n) => nf.loading || nf.isPending(today, n);

  return (
    <>
      <header className="page-head">
        <div>
          <div className="small muted">{ramadan.inRamadan ? 'Ramadan Mubarak' : `Ramadan mode · ${formatHijri(today, hijriOffset)}`}</div>
          <h1>{day ? `Day ${day} of 30` : 'Ramadan preview'}</h1>
        </div>
        <span style={{ color: 'var(--gold)' }}><Icon name="sparkle" size={20} /></span>
      </header>

      <GlobalAnnouncementCard />

      <div className="layout-2col">
        <div className="layout-2col__left">
          <IftarCard times={times} timesError={timesError} now={now} />

          {nf.error ? <ErrorState error={nf.error} onRetry={nf.reload} /> : (
            <div className="grid-2">
              <Tile label="Roza" sub={isDone('ramadan:roza') ? 'Fasting today' : 'Not marked'} done={isDone('ramadan:roza')} disabled={busy('ramadan:roza')} onClick={() => toggle('ramadan:roza')} />
              <Tile label="Sehri dua" sub={isDone('ramadan:sehri') ? 'Done' : 'Not yet'} done={isDone('ramadan:sehri')} disabled={busy('ramadan:sehri')} onClick={() => toggle('ramadan:sehri')} />
              <Link to="/quran" className={`tile ${pagesToday > 0 ? 'tile--done' : ''}`} aria-label={`Quran: para ${k.para}, ${pagesToday} pages today. Open Quran log`}>
                <span className="row row--between" style={{ width: '100%' }}>
                  <span className="strong">Quran</span>
                  <span className="tile__check">{pagesToday > 0 && <Icon name="check" size={14} strokeWidth={3} />}</span>
                </span>
                <span className="small muted">Para {k.para} · {pagesToday ? `${paraLabel(pagesToday)} today` : 'log today'}</span>
              </Link>
              <Tile label="Iftar dua" sub={isDone('ramadan:iftar') ? 'Done' : times ? `At ${formatTime12(times.maghrib)}` : 'At Maghrib'} done={isDone('ramadan:iftar')} disabled={busy('ramadan:iftar')} onClick={() => toggle('ramadan:iftar')} />
              <Tile label="Tahajjud" sub={isDone('tahajjud') ? 'Prayed' : 'Not yet'} done={isDone('tahajjud')} disabled={busy('tahajjud')} onClick={() => toggle('tahajjud')} />
              <Tile label="Sadaqah" sub={isDone('ramadan:sadaqah') ? 'Given today' : 'Add today'} done={isDone('ramadan:sadaqah')} disabled={busy('ramadan:sadaqah')} onClick={() => toggle('ramadan:sadaqah')} />
            </div>
          )}
        </div>

        <div className="layout-2col__right">
          <Card title="Taraweeh tonight" aside={`${rakats} of 20 rakats`}>
            <div className="blocks" role="group" aria-label="Taraweeh rakats">
              {Array.from({ length: 10 }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`block ${i < rakats / 2 ? 'block--on' : ''}`}
                  aria-label={`${(i + 1) * 2} rakats`}
                  aria-pressed={i < rakats / 2}
                  disabled={busy('ramadan:taraweeh')}
                  onClick={() => tapBlock(i)}
                />
              ))}
            </div>
            <div className="small muted">Each block = 2 rakats. Tap the last filled block to step back.</div>
          </Card>

          <Card title="Last 10 nights · odd nights">
            <div className="nights">
              {ODD_NIGHTS.map((n) => (
                <div key={n} className={`night ${nightNow === n ? 'night--now' : ''}`} aria-current={nightNow === n ? 'date' : undefined}>
                  <div className="night__n">{n}</div>
                  <div className="tiny muted">night</div>
                </div>
              ))}
            </div>
            <div className="small muted">
              {day && day >= 20 ? 'Seek Laylatul Qadr in the odd nights.' : 'Starts on night 21. Seek Laylatul Qadr in the odd nights.'}
            </div>
          </Card>

          <div className="grid-2">
            <button type="button" className="btn btn--gold" disabled={busy('ramadan:roza') || isDone('ramadan:roza')} onClick={() => toggle('ramadan:roza')}>
              {isDone('ramadan:roza') ? 'Roza marked' : 'Mark roza done'}
            </button>
            <button type="button" className="btn" disabled={busy('ramadan:sadaqah') || isDone('ramadan:sadaqah')} onClick={() => toggle('ramadan:sadaqah')}>
              {isDone('ramadan:sadaqah') ? 'Sadaqah given' : 'Sadaqah +'}
            </button>
          </div>

          <div className="small muted center">Ramadan items are private and never shared. <Link to="/ramadan/map">See your 30-day map</Link></div>
          <HadithCard screen="ramadan" />
        </div>
      </div>
    </>
  );
}
