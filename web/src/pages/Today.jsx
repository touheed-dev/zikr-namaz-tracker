import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, useToday } from '../context/AuthContext.jsx';
import { useMode } from '../context/ModeContext.jsx';
import { usePrayers, useZikr, useNafl, useQuran } from '../hooks/useLogs.js';
import { useSummary } from '../hooks/useSummary.js';
import { usePrayerTimes } from '../hooks/usePrayerTimes.js';
import { useNow } from '../hooks/useNow.js';
import { PrayerRow } from '../components/prayer/PrayerRow.jsx';
import { HadithCard } from '../components/ui/HadithCard.jsx';
import { GlobalAnnouncementCard } from '../components/ui/GlobalAnnouncementCard.jsx';
import { Card, Icon, Skeleton, ErrorState } from '../components/ui/index.jsx';
import { formatDay, dayOfYear } from '../utils/dates.js';
import { PRAYERS, PRAYER_LABELS, DONE_STATUSES, NAFL_ITEMS, formatPoints, paraLabel } from '../utils/points.js';
import { formatTime12, minutesUntil } from '../utils/prayerTimes.js';
import RamadanToday from './RamadanToday.jsx';

export default function Today() {
  const { ramadanActive } = useMode();
  return ramadanActive ? <RamadanToday /> : <NormalToday />;
}

function nextPrayer(times, now) {
  if (!times) return null;
  for (const p of PRAYERS) {
    const m = minutesUntil(times[p], now);
    if (m !== null && m > 0) return { prayer: p, mins: m };
  }
  return null;
}

function Reminder({ times, now, settings, isMarked, zikrDone }) {
  if (!times) return null;
  const next = nextPrayer(times, now);
  if (settings.jamaatNudge && next && next.mins <= 15) {
    return <ReminderLine>{PRAYER_LABELS[next.prayer]} in {next.mins} min. A good moment to head to the masjid.</ReminderLine>;
  }
  if (settings.azanAlert) {
    for (const p of PRAYERS) {
      const m = minutesUntil(times[p], now);
      if (m !== null && m <= 0 && m > -20 && !isMarked(p)) {
        return <ReminderLine>It is time for {PRAYER_LABELS[p]}.</ReminderLine>;
      }
    }
  }
  if (settings.azkarReminder) {
    const afterFajr = minutesUntil(times.fajr, now) <= 0 && minutesUntil(times.dhuhr, now) > 0;
    const afterAsr = minutesUntil(times.asr, now) <= 0 && minutesUntil(times.maghrib, now) > 0;
    if (afterFajr && !zikrDone('morning')) return <ReminderLine>Morning azkar, after Fajr.</ReminderLine>;
    if (afterAsr && !zikrDone('evening')) return <ReminderLine>Evening azkar, after Asr.</ReminderLine>;
  }
  return null;
}

function ReminderLine({ children }) {
  return (
    <div className="notice row" role="status">
      <Icon name="bell" size={18} />
      <span>{children}</span>
    </div>
  );
}

function NormalToday() {
  const { user } = useAuth();
  const today = useToday();
  const now = useNow(30000);
  const summary = useSummary();
  const pr = usePrayers(today, today);
  const zk = useZikr(today, today);
  const nf = useNafl(today, today);
  const qr = useQuran(today, today);
  const { times, error: timesError } = usePrayerTimes(today);
  const [qazaUsed, setQazaUsed] = useState(false);

  const doneToday = pr.entries.filter((e) => e.date === today && DONE_STATUSES.includes(e.status)).length;
  const next = useMemo(() => nextPrayer(times, now), [times, now]);
  const s = summary.data;

  // One hadith card per screen, chosen per day: Namaz area on even days,
  // Zikr area on odd days; the qaza hadith replaces it after Qaza is used.
  const hadithInZikr = !qazaUsed && dayOfYear(today) % 2 === 1;

  const onMark = async (prayer, status) => {
    try {
      await pr.mark(today, prayer, status);
      if (status === 'qaza') setQazaUsed(true);
      summary.refresh();
    } catch { /* rolled back + toast in the hook */ }
  };

  const toggleZikr = async (slot) => {
    try {
      await zk.set(today, slot, !zk.isDone(today, slot));
      summary.refresh();
    } catch { /* rolled back */ }
  };

  const toggleNafl = (name) => nf.set(today, name, !nf.get(today, name)?.done).catch(() => {});

  const timeLabel = (p) => {
    if (!times) return timesError ? '' : ' ';
    const t = formatTime12(times[p]);
    if (next?.prayer === p && next.mins <= 60) return `${t} · in ${next.mins} min`;
    return t;
  };

  const naflDone = NAFL_ITEMS.filter((i) => nf.get(today, i.name)?.done).length;
  const pages = qr.pagesOn(today);

  return (
    <>
      <header className="page-head">
        <div>
          <div className="small muted">Assalamu Alaikum{user?.name ? `, ${user.name}` : ''}</div>
          <h1>{formatDay(today)}</h1>
        </div>
        <Link to="/friends" className="points-chip" aria-label={s ? `${s.points} points this week, rank ${s.weekRank} this week` : 'Points loading'}>
          {s ? (
            <>
              <div className="points-chip__pts">{formatPoints(s.points)} pts</div>
              <div className="points-chip__rank">Rank #{s.weekRank} this week</div>
            </>
          ) : (
            <>
              <div className="points-chip__pts">{summary.error ? '—' : '…'}</div>
              <div className="points-chip__rank">this week</div>
            </>
          )}
        </Link>
      </header>

      <GlobalAnnouncementCard />

      <div className="grid-2">
        <div className="stat">
          <div className="stat__label">Current streak</div>
          <div className="stat__value">{s ? `${s.streak} ${s.streak === 1 ? 'day' : 'days'}` : '—'}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Today</div>
          <div className="stat__value">{pr.loading ? '—' : `${doneToday} / 5`}</div>
        </div>
      </div>

      <Reminder
        times={times}
        now={now}
        settings={user.settings}
        isMarked={(p) => Boolean(pr.get(today, p))}
        zikrDone={(slot) => zk.isDone(today, slot)}
      />

      <Card title="Namaz" aside="Jamaat +10 · Alone +4">
        {pr.loading && <Skeleton height={330} />}
        {!pr.loading && pr.error && <ErrorState error={pr.error} onRetry={pr.reload} />}
        {!pr.loading && !pr.error && (
          <div>
            {PRAYERS.map((p) => (
              <PrayerRow
                key={p}
                prayer={p}
                timeLabel={timeLabel(p)}
                entry={pr.get(today, p)}
                pending={pr.isPending(today, p)}
                onMark={(status) => onMark(p, status)}
              />
            ))}
          </div>
        )}
        <div className="small muted">
          {timesError ? 'Prayer times unavailable right now. ' : ''}
          Changing a marked prayer earns 0 points. <Link to="/history">Log and edit past days</Link>
        </div>
      </Card>

      {!hadithInZikr && <HadithCard screen="today" variant={qazaUsed ? 'qaza' : undefined} />}

      <Card title="Zikr">
        {zk.error ? <ErrorState error={zk.error} onRetry={zk.reload} /> : (
          <div className="grid-2">
            {[['morning', 'Morning azkar'], ['evening', 'Evening azkar']].map(([slot, label]) => {
              const done = zk.isDone(today, slot);
              return (
                <button
                  key={slot}
                  type="button"
                  className="toggle-btn"
                  aria-pressed={done}
                  disabled={zk.loading || zk.isPending(today, slot)}
                  onClick={() => toggleZikr(slot)}
                >
                  {done && <Icon name="check" size={18} />}
                  {label}
                </button>
              );
            })}
          </div>
        )}
        <div className="small muted">Both in a day earns +3. Changes after marking earn 0.</div>
      </Card>

      {hadithInZikr && <HadithCard screen="today" variant="zikr" />}

      <Card>
        <div className="row row--between">
          <div>
            <h2 className="card__title">Quran today</h2>
            {qr.error ? (
              <div className="small muted">Could not load. <button type="button" className="linkbtn" onClick={() => qr.reload()}>Retry</button></div>
            ) : (
              <>
                <div>{qr.loading ? '—' : `${pages} ${pages === 1 ? 'page' : 'pages'} · ${paraLabel(pages)}`}</div>
                <div className="small muted">{s ? `${s.quranStreak}-day Quran streak` : ' '}</div>
              </>
            )}
          </div>
          <Link to="/quran" className="btn btn--primary">Log more</Link>
        </div>
      </Card>

      <Card>
        <div className="row row--between">
          <div className="row">
            <Icon name="lock" size={18} />
            <h2 className="card__title">Nafl</h2>
            <span className="small muted">Only you can see this</span>
          </div>
          <Link to="/nafl" className="btn btn--ghost btn--sm">Open</Link>
        </div>
        {nf.error ? <ErrorState error={nf.error} onRetry={nf.reload} /> : (
          <div className="seg seg--4">
            {NAFL_ITEMS.slice(0, 4).map((i) => {
              const done = Boolean(nf.get(today, i.name)?.done);
              return (
                <button
                  key={i.name}
                  type="button"
                  className="toggle-btn toggle-btn--light"
                  style={{ minHeight: 48, fontSize: 13 }}
                  aria-pressed={done}
                  disabled={nf.loading || nf.isPending(today, i.name)}
                  onClick={() => toggleNafl(i.name)}
                >
                  {i.short || i.label}
                </button>
              );
            })}
          </div>
        )}
        <div className="small muted">{naflDone} of 5 today · no points, never shared</div>
      </Card>
    </>
  );
}
