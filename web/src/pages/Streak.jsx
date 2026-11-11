import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToday } from '../context/AuthContext.jsx';
import { usePrayers, useZikr } from '../hooks/useLogs.js';
import { useSummary } from '../hooks/useSummary.js';
import { NamazHeatmap, DayHeatmap, ZikrHeatmap, NamazLegend } from '../components/heatmap/Heatmaps.jsx';
import { HadithCard } from '../components/ui/HadithCard.jsx';
import { Card, Tabs, Skeleton, ErrorState, EmptyState, Icon } from '../components/ui/index.jsx';
import { PageHead } from '../components/layout/AppShell.jsx';
import { addDays, formatRange, startOfWeek } from '../utils/dates.js';

const RANGES = [
  { value: '21', label: '3 weeks' },
  { value: '91', label: '3 months' },
  { value: '371', label: 'Year' },
];

export default function Streak() {
  const today = useToday();
  const [range, setRange] = useState('21');
  const days = Number(range);
  const from = range === '21' ? addDays(today, -20) : addDays(startOfWeek(today), -(days - 7));
  const pr = usePrayers(from, today);
  const zk = useZikr(addDays(today, -20), today);
  const summary = useSummary();
  const s = summary.data;

  return (
    <>
      <PageHead title="Streak map" />
      <Tabs label="Range" items={RANGES} value={range} onChange={setRange} />

      <Card title={range === '21' ? 'Namaz · last 21 days' : `Namaz · last ${range === '91' ? '13 weeks' : '53 weeks'}`} aside={formatRange(from, today)}>
        {pr.loading && <Skeleton height={range === '21' ? 120 : 150} />}
        {!pr.loading && pr.error && <ErrorState error={pr.error} onRetry={pr.reload} />}
        {!pr.loading && !pr.error && pr.entries.length === 0 && (
          <EmptyState icon="grid" title="Nothing marked yet">
            Mark today&apos;s prayers and your map starts filling in.
          </EmptyState>
        )}
        {!pr.loading && !pr.error && pr.entries.length > 0 && (range === '21'
          ? <NamazHeatmap entries={pr.entries} endISO={today} days={21} today={today} />
          : <DayHeatmap entries={pr.entries} endISO={today} weeks={range === '91' ? 13 : 53} today={today} />)}
        <NamazLegend />
        {range !== '21' && <div className="tiny muted">One cell per day (Mon at top). Coloured when all five were prayed.</div>}
      </Card>

      <div className="grid-3">
        <div className="stat"><div className="stat__value stat__value--sm">{s ? s.streak : '—'}</div><div className="stat__label">Day streak</div></div>
        <div className="stat"><div className="stat__value stat__value--sm">{s ? s.bestStreak : '—'}</div><div className="stat__label">Best streak</div></div>
        <div className="stat"><div className="stat__value stat__value--sm">{s ? (s.jamaatPct === null ? '—' : `${s.jamaatPct}%`) : '—'}</div><div className="stat__label">In Jamaat (30 days)</div></div>
      </div>
      {summary.error && <ErrorState error={summary.error} onRetry={summary.reload} title="Could not load your stats" />}

      <Card title="Zikr · morning + evening">
        {zk.loading && <Skeleton height={24} />}
        {!zk.loading && zk.error && <ErrorState error={zk.error} onRetry={zk.reload} />}
        {!zk.loading && !zk.error && <ZikrHeatmap entries={zk.entries} endISO={today} days={21} today={today} />}
        <div className="small muted">Light = one set done · Dark = both done</div>
      </Card>

      <HadithCard screen="streak" />

      <Card className="card--tight">
        <nav aria-label="More" className="list">
          {[
            ['/history', 'Log and edit past days'],
            ['/report', 'Weekly report'],
            ['/badges', 'Badges'],
          ].map(([to, label]) => (
            <Link key={to} to={to} className="list-row" style={{ textDecoration: 'none' }}>
              <span className="grow">{label}</span>
              <Icon name="chevronRight" size={18} />
            </Link>
          ))}
        </nav>
      </Card>
    </>
  );
}
