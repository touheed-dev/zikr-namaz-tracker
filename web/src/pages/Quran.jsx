import { useEffect, useState } from 'react';
import { useToday } from '../context/AuthContext.jsx';
import { useQuran } from '../hooks/useLogs.js';
import { useSummary } from '../hooks/useSummary.js';
import { QuranMap } from '../components/heatmap/Heatmaps.jsx';
import { HadithCard } from '../components/ui/HadithCard.jsx';
import { Card, Icon, ProgressBar, LoadingBlocks, ErrorState } from '../components/ui/index.jsx';
import { PageHead } from '../components/layout/AppShell.jsx';
import { addDays, startOfWeek, daysBetween } from '../utils/dates.js';
import { paraLabel, khatamProgress } from '../utils/points.js';
import { useToast } from '../context/ToastContext.jsx';

const QUICK = [
  { pages: 5, label: '+¼ para' },
  { pages: 10, label: '+½ para' },
  { pages: 20, label: '+1 para' },
  { pages: 40, label: '+2 para' },
];

export default function Quran() {
  const today = useToday();
  const from = addDays(addDays(startOfWeek(today), 6), -34);
  const qr = useQuran(from, today);
  const summary = useSummary();
  const toast = useToast();
  const saved = qr.pagesOn(today);
  const [pages, setPages] = useState(null);
  const value = pages ?? saved;

  // when today's saved value arrives (or the day changes), reset the stepper
  useEffect(() => { setPages(null); }, [today, saved]);

  const weekStart = startOfWeek(today);
  const weekPages = qr.entries.filter((e) => daysBetween(weekStart, e.date) >= 0 && daysBetween(e.date, today) >= 0)
    .reduce((n, e) => n + e.pages, 0);
  const k = khatamProgress(qr.totalPages);
  const s = summary.data;
  const clamp = (n) => Math.max(0, Math.min(604, n));

  const save = async () => {
    try {
      await qr.save(today, value);
      setPages(null);
      summary.refresh();
      toast.show(`Saved: ${value} pages today`);
    } catch { /* rolled back + toast */ }
  };

  if (qr.loading) {
    return (<><PageHead title="Quran" /><LoadingBlocks heights={[96, 330, 250, 90]} /></>);
  }
  if (qr.error) {
    return (<><PageHead title="Quran" /><ErrorState error={qr.error} onRetry={qr.reload} /></>);
  }

  return (
    <>
      <PageHead title="Quran" />
      <div className="grid-2">
        <div className="stat">
          <div className="stat__label">Quran streak</div>
          <div className="stat__value">{s ? `${s.quranStreak} ${s.quranStreak === 1 ? 'day' : 'days'}` : '—'}</div>
          <div className="stat__sub">Best {s ? s.quranBest : '—'}</div>
        </div>
        <div className="stat">
          <div className="stat__label">This week</div>
          <div className="stat__value">{weekPages} pages</div>
          <div className="stat__sub">≈ {paraLabel(weekPages)}</div>
        </div>
      </div>

      <Card title="Log today's recitation">
        <div className="field__label" id="pages-label">Pages</div>
        <div className="stepper" role="group" aria-labelledby="pages-label">
          <button type="button" className="stepper__btn" onClick={() => setPages(clamp(value - 1))} aria-label="One page less" disabled={value <= 0}>
            <Icon name="minus" />
          </button>
          <div className="stepper__val" aria-live="polite">
            <div className="stepper__num">{value}</div>
            <div className="small muted">pages · ≈ {paraLabel(value)}</div>
          </div>
          <button type="button" className="stepper__btn stepper__btn--plus" onClick={() => setPages(clamp(value + 1))} aria-label="One page more" disabled={value >= 604}>
            <Icon name="plus" />
          </button>
        </div>
        <div className="small muted">Or by para (1 para ≈ 20 pages)</div>
        <div className="row row--wrap">
          {QUICK.map((q) => (
            <button key={q.pages} type="button" className="chip chip--btn" onClick={() => setPages(clamp(value + q.pages))}>
              {q.label}
            </button>
          ))}
          <button type="button" className="chip chip--btn" onClick={() => setPages(0)}>Reset</button>
        </div>
        <button type="button" className="btn btn--primary btn--block" onClick={save} disabled={qr.saving || value === saved}>
          {qr.saving ? 'Saving…' : 'Save for today'}
        </button>
        <div className="tiny muted center">Save sets today&apos;s total. Quran never adds leaderboard points.</div>
      </Card>

      <Card title="Quran map" aside="Last 5 weeks">
        <QuranMap entries={qr.entries} today={today} />
        <div className="legend">
          <span className="legend__item"><span className="cell" />None</span>
          <span className="legend__item"><span className="cell cell--z1" />Under ¼ para</span>
          <span className="legend__item"><span className="cell cell--z2" />¼ para or more</span>
        </div>
      </Card>

      <Card title="Khatam progress" aside={`Para ${k.para} · ${k.percent}%`}>
        <ProgressBar value={k.current} max={604} label="Khatam progress" />
        <div className="small muted">
          {k.completed > 0 ? `${k.completed} khatam${k.completed > 1 ? 's' : ''} completed. ` : ''}
          {qr.totalPages} pages in total. Private by default. Friends see your Quran streak only if you turn it on in Profile.
        </div>
      </Card>

      <HadithCard screen="quran" />
    </>
  );
}
