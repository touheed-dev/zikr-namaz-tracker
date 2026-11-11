import { useSearchParams } from 'react-router-dom';
import { useToday } from '../context/AuthContext.jsx';
import { usePrayers } from '../hooks/useLogs.js';
import { useSummary } from '../hooks/useSummary.js';
import { PrayerRow } from '../components/prayer/PrayerRow.jsx';
import { HadithCard } from '../components/ui/HadithCard.jsx';
import { Card, LoadingBlocks, ErrorState } from '../components/ui/index.jsx';
import { PageHead } from '../components/layout/AppShell.jsx';
import { addDays, formatDay, windowDaysLeft, daysBetween } from '../utils/dates.js';
import { PRAYERS, PRAYER_LABELS } from '../utils/points.js';

function dayStatus(entries, date) {
  const rows = PRAYERS.map((p) => entries.find((e) => e.date === date && e.prayer === p));
  const marked = rows.filter(Boolean);
  const edited = PRAYERS.filter((p, i) => rows[i]?.edited);
  if (marked.length === 0) return 'Nothing marked';
  if (edited.length) return `${marked.length} of 5 · ${edited.map((p) => PRAYER_LABELS[p]).join(', ')} edited (0 pts)`;
  if (marked.length === 4) {
    const missing = PRAYERS.find((p, i) => !rows[i]);
    return `${PRAYER_LABELS[missing]} not marked`;
  }
  return `${marked.length} of 5 marked`;
}

export default function History() {
  const today = useToday();
  const from = addDays(today, -6);
  const [params, setParams] = useSearchParams();
  const requested = params.get('date');
  const selected = requested && daysBetween(from, requested) >= 0 && daysBetween(requested, today) >= 0 ? requested : today;
  const pr = usePrayers(from, today);
  const summary = useSummary();

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  const left = windowDaysLeft(selected, today);

  const onMark = async (prayer, status) => {
    try {
      await pr.mark(selected, prayer, status);
      summary.refresh();
    } catch { /* rolled back */ }
  };

  return (
    <>
      <PageHead title="Log and edit" />
      <Card className="card--tight">
        <h2 className="card__title">3-day points window</h2>
        <p className="small muted">
          Mark a prayer within 3 days to earn points. Older days can still be filled for your own record,
          with 0 points. Editing an entry also earns 0 points.
        </p>
      </Card>

      {pr.loading && <LoadingBlocks heights={[60, 60, 60, 60, 60, 60, 60]} />}
      {!pr.loading && pr.error && <ErrorState error={pr.error} onRetry={pr.reload} />}
      {!pr.loading && !pr.error && (
        <>
          <div className="stack stack--sm" role="list" aria-label="Last 7 days">
            {days.map((d) => {
              const n = windowDaysLeft(d, today);
              return (
                <div role="listitem" key={d}>
                  <button
                    type="button"
                    className="day-item"
                    aria-pressed={d === selected}
                    onClick={() => setParams(d === today ? {} : { date: d }, { replace: true })}
                  >
                    <span>
                      <span className="strong">{formatDay(d)}{d === today ? ' · Today' : ''}</span>
                      <br />
                      <span className="small muted">{dayStatus(pr.entries, d)}</span>
                    </span>
                    {n > 0
                      ? <span className={`chip ${n === 1 ? 'chip--gold' : 'chip--green'}`}>{n} {n === 1 ? 'day' : 'days'} left</span>
                      : <span className="chip">Record only · 0 pts</span>}
                  </button>
                </div>
              );
            })}
          </div>

          <Card title={formatDay(selected)} aside={left > 0 ? `Earns points · ${left} ${left === 1 ? 'day' : 'days'} left` : 'Record only · 0 pts'}>
            <div>
              {PRAYERS.map((p) => (
                <PrayerRow
                  key={`${selected}-${p}`}
                  prayer={p}
                  entry={pr.get(selected, p)}
                  pending={pr.isPending(selected, p)}
                  eligible={left > 0}
                  onMark={(status) => onMark(p, status)}
                />
              ))}
            </div>
            <p className="small muted">Changing or clearing a marked prayer counts as an edit and earns 0 points.</p>
          </Card>
        </>
      )}

      <HadithCard screen="history" variant="qaza" />

      <Card className="card--tight">
        <div className="eyebrow">Why this rule</div>
        <p className="small">
          Rank stays fair among friends. Your streak and heatmap still show the truth, even for days that earned no points.
        </p>
      </Card>
    </>
  );
}
