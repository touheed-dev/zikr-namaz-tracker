import { useState } from 'react';
import { Link } from 'react-router-dom';
import { report as api, challenges } from '../api/index.js';
import { useAsync } from '../hooks/useAsync.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Card, Icon, LoadingBlocks, ErrorState, EmptyState } from '../components/ui/index.jsx';
import { formatRange } from '../utils/dates.js';
import { PRAYER_LABELS, paraLabel, capitalize } from '../utils/points.js';

function Ring({ value, total }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const pct = total ? value / total : 0;
  return (
    <svg viewBox="0 0 110 110" width="110" height="110" role="img" aria-label={`${value} of ${total} in Jamaat`}>
      <circle cx="55" cy="55" r={r} fill="none" stroke="var(--inset)" strokeWidth="10" />
      <circle
        cx="55" cy="55" r={r} fill="none" stroke="var(--heat-jamaat)" strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 55 55)"
      />
      <text x="55" y="58" textAnchor="middle" fill="var(--text)" style={{ font: '600 28px var(--font-head)' }}>{value}</text>
      <text x="55" y="76" textAnchor="middle" fill="var(--muted)" style={{ font: '12px var(--font-body)' }}>of {total}</text>
    </svg>
  );
}

function DayBars({ perDay }) {
  return (
    <figure style={{ margin: 0 }}>
      <div className="bars" aria-hidden="true">
        {perDay.map((d) => (
          <div key={d.date}>
            <div className="bar">
              <div className="bar__seg bar__seg--jamaat" style={{ height: `${(d.jamaat / 5) * 100}%` }} />
              <div className="bar__seg bar__seg--alone" style={{ height: `${(d.alone / 5) * 100}%` }} />
            </div>
            <div className="bar__label">{d.day}</div>
          </div>
        ))}
      </div>
      <figcaption className="sr-only">
        {perDay.map((d) => `${d.date}: ${d.jamaat} in Jamaat, ${d.alone} alone`).join('; ')}
      </figcaption>
      <div className="legend mt-8">
        <span className="legend__item"><span className="cell cell--jamaat" />Jamaat</span>
        <span className="legend__item"><span className="cell cell--alone" />Alone</span>
      </div>
    </figure>
  );
}

export default function Report() {
  const { user, saveSettings } = useAuth();
  const toast = useToast();
  const [offset, setOffset] = useState(0);
  const r = useAsync(() => api.weekly(offset), [offset]);
  const [goalBusy, setGoalBusy] = useState(false);
  const [goalAdded, setGoalAdded] = useState(false);
  const d = r.data;

  if (user.settings.weeklyReport === false) {
    return (
      <Card>
        <EmptyState icon="lock" title="Weekly report is off" action={<Link to="/profile" className="btn btn--primary">Turn it on in Profile</Link>}>
          The report is only ever for you, never for friends.
        </EmptyState>
      </Card>
    );
  }

  const chooseFix = async (choice) => {
    try {
      await saveSettings({ smartFixChoice: user.settings.smartFixChoice === choice ? null : choice });
    } catch (err) {
      toast.show(`Not saved: ${err.message}`);
    }
  };

  const addGoal = async () => {
    if (goalBusy || !d?.nextGoal) return;
    setGoalBusy(true);
    try {
      const g = d.nextGoal;
      await challenges.create({ type: 'personal', kind: g.kind, target: g.target, prayer: g.prayer, pages: g.pages, title: g.title });
      setGoalAdded(true);
      toast.show('Added to your personal challenges');
    } catch (err) {
      if (!err.auth) toast.show(err.message);
    } finally {
      setGoalBusy(false);
    }
  };

  const weekNav = (
    <div className="row row--between">
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setOffset((o) => o + 1); setGoalAdded(false); }} disabled={offset >= 52 || r.loading}>
        <Icon name="chevronLeft" size={18} /> Earlier
      </button>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setOffset((o) => Math.max(0, o - 1)); setGoalAdded(false); }} disabled={offset === 0 || r.loading}>
        Later <Icon name="chevronRight" size={18} />
      </button>
    </div>
  );

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow eyebrow--light row" style={{ gap: 6 }}>
            <Icon name="lock" size={14} /> Only for you{d ? ` · ${formatRange(d.from, d.to)}` : ''}
          </div>
          <h1>Your week in ibadat</h1>
        </div>
      </header>
      {weekNav}

      {r.loading && <LoadingBlocks heights={[150, 240, 100, 100, 120]} />}
      {!r.loading && r.error && <ErrorState error={r.error} onRetry={r.reload} />}
      {!r.loading && !r.error && d && !d.hasData && (
        <Card><EmptyState icon="calendar" title="Nothing logged that week">Your report fills in from the prayers you mark.</EmptyState></Card>
      )}
      {!r.loading && !r.error && d && d.hasData && (
        <>
          <Card>
            <div className="ring-wrap">
              <Ring value={d.jamaat.done} total={d.jamaat.total} />
              <div className="stack stack--sm">
                <h2>Jamaat prayers</h2>
                <p className="small muted">
                  {d.jamaat.prev !== d.jamaat.done ? `${d.jamaat.done > d.jamaat.prev ? 'Up' : 'Down'} from ${d.jamaat.prev} last week. ` : 'Same as last week. '}
                  {d.prayed.done} of {d.prayed.total} prayers offered{d.prayed.qaza ? `, ${d.prayed.qaza} made up as qaza` : ''}.
                </p>
                {d.jamaat.done !== d.jamaat.prev && (
                  <span className="chip" style={{ alignSelf: 'flex-start' }}>
                    {d.jamaat.done > d.jamaat.prev ? '+' : '−'}{Math.abs(d.jamaat.done - d.jamaat.prev)} vs last week
                  </span>
                )}
              </div>
            </div>
          </Card>

          <div className="report-2col">
            <Card title="Day by day"><DayBars perDay={d.perDay} /></Card>

            <div className="grid-2">
              <div className="stat">
                <div className="stat__label">Strongest waqt</div>
                <div className="stat__value stat__value--sm">{d.strongest ? PRAYER_LABELS[d.strongest.prayer] : '—'}</div>
                <div className="stat__sub">{d.strongest ? `${d.strongest.jamaat} / 7 in Jamaat` : 'No Jamaat yet'}</div>
              </div>
              <div className="stat">
                <div className="stat__label">Needs care</div>
                <div className="stat__value stat__value--sm">{d.weakest ? PRAYER_LABELS[d.weakest.prayer] : '—'}</div>
                <div className="stat__sub">{d.weakest ? `${d.weakest.jamaat} / 7 in Jamaat` : 'All even'}</div>
              </div>
              <div className="stat">
                <div className="stat__label">Zikr</div>
                <div className="stat__value stat__value--sm">{d.zikr.days} / 7 days</div>
                <div className="stat__sub">
                  {d.zikr.missed ? `${d.zikr.missed === 'both' ? 'Azkar' : `${capitalize(d.zikr.missed)} azkar`} missed ${d.zikr.missedCount === 1 ? 'once' : `${d.zikr.missedCount} times`}` : 'Both, every day'}
                </div>
              </div>
              <div className="stat">
                <div className="stat__label">Quran</div>
                <div className="stat__value stat__value--sm">{d.quran.pages} pages</div>
                <div className="stat__sub">≈ {paraLabel(d.quran.pages)} · {d.quran.days} of 7 days</div>
              </div>
            </div>
          </div>

          {d.nafl.items.length > 0 && (
            <Card className="card--tight">
              <div className="small muted">Nafl (just for you)</div>
              <div className="strong">{d.nafl.items.map((i) => `${i.label} ${i.days}`).join(' · ')}</div>
            </Card>
          )}

          {d.insight && (
            <Card className="insight card--tight">
              <div className="eyebrow" style={{ color: 'inherit', opacity: 0.85 }}>What I noticed</div>
              <p>{d.insight}</p>
            </Card>
          )}

          {d.smartFix && (
            <Card className="card--gold">
              <div className="eyebrow eyebrow--gold">Smart fix · Fajr slipped {d.smartFix.misses} times in 7 days</div>
              <p>Try a backup plan for next week:</p>
              <div className="grid-2">
                <button type="button" className="tile" aria-pressed={user.settings.smartFixChoice === 'alarm'} onClick={() => chooseFix('alarm')}>
                  <span className="strong">Backup alarm</span>
                  <span className="small muted">A second alarm 15 min after the first</span>
                </button>
                <button type="button" className="tile" aria-pressed={user.settings.smartFixChoice === 'buddy'} onClick={() => chooseFix('buddy')}>
                  <span className="strong">Buddy call</span>
                  <span className="small muted">Ask a friend to ring you</span>
                </button>
              </div>
              <p className="tiny muted">Shown only after 3 misses in a week. You can switch it off in Profile.</p>
            </Card>
          )}

          {d.nextGoal && (
            <Card>
              <div className="small muted">Next week&apos;s goal</div>
              <div className="strong" style={{ fontSize: 18 }}>{d.nextGoal.title}</div>
              <button type="button" className="btn btn--primary" onClick={addGoal} disabled={goalBusy || goalAdded}>
                {goalAdded ? 'Added' : goalBusy ? 'Adding…' : 'Add as personal challenge'}
              </button>
            </Card>
          )}
        </>
      )}
    </>
  );
}
