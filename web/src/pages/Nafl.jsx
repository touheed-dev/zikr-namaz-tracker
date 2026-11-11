import { useToday } from '../context/AuthContext.jsx';
import { useNafl } from '../hooks/useLogs.js';
import { MiniStrip } from '../components/heatmap/Heatmaps.jsx';
import { HadithCard } from '../components/ui/HadithCard.jsx';
import { Card, Switch, PrivateBanner, LoadingBlocks, ErrorState } from '../components/ui/index.jsx';
import { PageHead } from '../components/layout/AppShell.jsx';
import { addDays, rangeISO } from '../utils/dates.js';
import { NAFL_ITEMS } from '../utils/points.js';
import { currentStreak } from '../utils/heatmap.js';

export default function Nafl() {
  const today = useToday();
  const from = addDays(today, -59);
  const nf = useNafl(from, today);
  const dates14 = rangeISO(addDays(today, -13), today);

  const isDone = (name) => (d) => Boolean(nf.get(d, name)?.done);
  const anyDays = new Set(nf.entries.filter((e) => e.done && !e.name.startsWith('ramadan:')).map((e) => e.date));
  const streak = currentStreak(anyDays, today);

  return (
    <>
      <PageHead title="Nafl" />
      <PrivateBanner>No points, no leaderboard, no sharing. It never appears on a friend&apos;s screen.</PrivateBanner>

      {nf.loading && <LoadingBlocks heights={[300, 200]} />}
      {!nf.loading && nf.error && <ErrorState error={nf.error} onRetry={nf.reload} />}
      {!nf.loading && !nf.error && (
        <>
          <Card>
            {NAFL_ITEMS.map((i) => {
              const done = isDone(i.name)(today);
              return (
                <Switch
                  key={i.name}
                  label={i.label}
                  hint={done ? 'Done today' : 'Not yet'}
                  checked={done}
                  disabled={nf.isPending(today, i.name)}
                  onChange={(v) => nf.set(today, i.name, v).catch(() => {})}
                />
              );
            })}
          </Card>

          <Card title="Your nafl, last 14 days" aside={`Own streak: ${streak} ${streak === 1 ? 'day' : 'days'}`}>
            <div className="stack">
              {NAFL_ITEMS.map((i) => (
                <div key={i.name} className="row" style={{ alignItems: 'center' }}>
                  <span className="small" style={{ width: 70, flex: '0 0 auto' }}>{i.short || i.label}</span>
                  <div className="grow"><MiniStrip dates={dates14} isDone={isDone(i.name)} label={i.label} /></div>
                </div>
              ))}
            </div>
            <div className="small muted">Light = done</div>
          </Card>
        </>
      )}

      <HadithCard screen="nafl" />
    </>
  );
}
