import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { challenges as api, friends as friendsApi } from '../api/index.js';
import { useAsync } from '../hooks/useAsync.js';
import { useToast } from '../context/ToastContext.jsx';
import { Card, Avatar, ProgressBar, LoadingBlocks, ErrorState, EmptyState, Dialog } from '../components/ui/index.jsx';
import { PageHead } from '../components/layout/AppShell.jsx';
import { WEEK_LETTERS } from '../utils/dates.js';
import { PRAYERS, PRAYER_LABELS } from '../utils/points.js';

export const TEMPLATES = [
  { template: 'fajr7', title: '7 days of Fajr in Jamaat', sub: 'Fajr in Jamaat on 7 days', reward: 50 },
  { template: 'jumuah', title: 'Jumuah together', sub: 'Everyone in Jamaat on Friday', reward: 20 },
  { template: 'azkar7', title: 'Azkar week', sub: 'Morning and evening, all 7 days', reward: 30 },
  { template: 'weekend', title: 'No-miss weekend', sub: 'All 10 prayers on Sat and Sun', reward: 30 },
];

function ChallengeTabs() {
  return (
    <nav className="tabs" aria-label="Challenge type">
      <NavLink to="/challenges" end className="tabs__tab">With friends</NavLink>
      <NavLink to="/challenges/personal" className="tabs__tab">Personal</NavLink>
    </nav>
  );
}

function FriendChallengeCard({ c, onRespond, onLeave, busy }) {
  const accepted = c.members.filter((m) => m.status === 'accepted');
  const others = accepted.length - 1;
  return (
    <Card className="card--deep">
      <div className="eyebrow eyebrow--light">
        {c.completed ? 'Completed' : 'Active'}{others > 0 ? ` · with ${others} ${others === 1 ? 'friend' : 'friends'}` : ''}
      </div>
      <h2 className="card__title">{c.title}</h2>
      <div className="seg" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }} aria-label="This week">
        {c.week.map((d, i) => (
          <span
            key={d.date}
            className={`chip ${d.done ? 'chip--green' : ''}`}
            style={{ justifyContent: 'center', opacity: d.future ? 0.5 : 1 }}
            aria-label={`${WEEK_LETTERS[i]}: ${d.done ? 'done together' : 'not yet'}`}
          >
            {WEEK_LETTERS[i]}
          </span>
        ))}
      </div>
      <div className="row row--between">
        <div className="avatars" aria-label={`Members: ${c.members.map((m) => m.name).join(', ')}`}>
          {c.members.map((m) => <Avatar key={m.id} name={m.name} small />)}
        </div>
        <span className="small muted">{c.progress} of {c.target} done · reward +{c.reward} pts</span>
      </div>
      <ProgressBar value={c.progress} max={c.target} label={`${c.title} progress`} />
      {c.members.some((m) => m.status === 'invited') && (
        <div className="tiny muted">Waiting for: {c.members.filter((m) => m.status === 'invited').map((m) => m.name).join(', ')}</div>
      )}
      {c.myStatus === 'invited' ? (
        <div className="grid-2">
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => onRespond(c, true)}>Join</button>
          <button type="button" className="btn" disabled={busy} onClick={() => onRespond(c, false)}>Decline</button>
        </div>
      ) : (
        <div className="tiny muted">
          Days count when every member who joined prayed it, marked within 3 days.
          {' '}
          <button type="button" className="linkbtn" disabled={busy} onClick={() => onLeave(c)}>{c.isOwner ? 'Delete' : 'Leave'}</button>
        </div>
      )}
    </Card>
  );
}

function InviteDialog({ template, onClose, onCreated }) {
  const toast = useToast();
  const board = useAsync(() => friendsApi.leaderboard('all'), []);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const friendsList = (board.data || []).filter((r) => !r.isMe);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.create({ type: 'friend', template: template.template, kind: null, title: template.title, invites: picked });
      toast.show('Challenge started');
      onCreated();
    } catch (err) {
      if (!err.auth) toast.show(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={template.title} onClose={onClose}>
      <p className="small muted">{template.sub} · reward +{template.reward} pts each, once, when you finish together.</p>
      {board.loading && <LoadingBlocks heights={[56, 56]} />}
      {board.error && <ErrorState error={board.error} onRetry={board.reload} />}
      {!board.loading && !board.error && friendsList.length === 0 && (
        <EmptyState icon="users" title="No friends yet">Add a friend first, then invite them here.</EmptyState>
      )}
      <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="field__label">Invite friends</legend>
        {friendsList.map((f) => (
          <label key={f.id} className="list-row" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={picked.includes(f.id)}
              onChange={(e) => setPicked((p) => (e.target.checked ? [...p, f.id] : p.filter((x) => x !== f.id)))}
              style={{ width: 20, height: 20 }}
            />
            <Avatar name={f.name} small />
            <span className="grow">{f.name}</span>
          </label>
        ))}
      </fieldset>
      <button type="button" className="btn btn--primary" onClick={create} disabled={busy || picked.length === 0}>
        {busy ? 'Starting…' : 'Start challenge'}
      </button>
    </Dialog>
  );
}

function FriendTab() {
  const toast = useToast();
  const list = useAsync(() => api.list('friend'), []);
  const [tpl, setTpl] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn, ok) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (ok) toast.show(ok);
      await list.reload({ silent: true });
    } catch (err) {
      if (!err.auth) toast.show(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {list.loading && <LoadingBlocks heights={[200]} />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {!list.loading && !list.error && (list.data.length === 0 ? (
        <Card><EmptyState icon="users" title="No challenges yet">Start one below and invite friends.</EmptyState></Card>
      ) : list.data.map((c) => (
        <FriendChallengeCard
          key={c.id}
          c={c}
          busy={busy}
          onRespond={(ch, yes) => run(() => api.respond(ch.id, yes), yes ? 'Joined' : 'Declined')}
          onLeave={(ch) => run(() => api.leave(ch.id), ch.isOwner ? 'Challenge deleted' : 'Left challenge')}
        />
      )))}

      <h2 style={{ marginTop: 6 }}>Start a new one</h2>
      {TEMPLATES.map((t) => (
        <Card key={t.template}>
          <div className="row row--between">
            <div>
              <div className="strong">{t.title}</div>
              <div className="small muted">{t.sub} · +{t.reward} pts</div>
            </div>
            <button type="button" className="btn btn--sm" onClick={() => setTpl(t)}>Invite</button>
          </div>
        </Card>
      ))}
      {tpl && <InviteDialog template={tpl} onClose={() => setTpl(null)} onCreated={() => { setTpl(null); list.reload({ silent: true }); }} />}
    </>
  );
}

const KINDS = [
  { kind: 'namaz', title: 'Namaz goal', sub: 'All 5 on time, no qaza' },
  { kind: 'jamaat', title: 'Jamaat goal', sub: 'Pick a waqt or all' },
  { kind: 'zikr', title: 'Zikr goal', sub: 'Morning or evening' },
  { kind: 'quran', title: 'Quran goal', sub: 'Pages a day' },
];

function progressLabel(c) {
  return `${c.progress} / ${c.target}`;
}

function PersonalForm({ kind, onClose, onCreated }) {
  const toast = useToast();
  const [target, setTarget] = useState(kind === 'zikr' ? 21 : 14);
  const [prayer, setPrayer] = useState('all');
  const [slot, setSlot] = useState('morning');
  const [pages, setPages] = useState(5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const meta = KINDS.find((k) => k.kind === kind);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const t = Number(target);
    if (!Number.isInteger(t) || t < 1 || t > 365) { setErr('Days must be between 1 and 365.'); return; }
    if (kind === 'quran' && (!Number.isInteger(Number(pages)) || pages < 1 || pages > 604)) { setErr('Pages must be between 1 and 604.'); return; }
    setErr(null);
    setBusy(true);
    try {
      await api.create({ type: 'personal', kind, target: t, prayer: kind === 'jamaat' ? prayer : undefined, slot: kind === 'zikr' ? slot : undefined, pages: kind === 'quran' ? Number(pages) : undefined });
      toast.show('Goal added');
      onCreated();
    } catch (error) {
      setErr(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={meta.title} onClose={onClose}>
      <form onSubmit={submit} className="stack" noValidate>
        {kind === 'jamaat' && (
          <div className="field">
            <label className="field__label" htmlFor="g-prayer">Waqt</label>
            <select id="g-prayer" className="select" value={prayer} onChange={(e) => setPrayer(e.target.value)}>
              <option value="all">All five</option>
              {PRAYERS.map((p) => <option key={p} value={p}>{PRAYER_LABELS[p]}</option>)}
            </select>
          </div>
        )}
        {kind === 'zikr' && (
          <div className="field">
            <label className="field__label" htmlFor="g-slot">Azkar</label>
            <select id="g-slot" className="select" value={slot} onChange={(e) => setSlot(e.target.value)}>
              <option value="morning">Morning</option>
              <option value="evening">Evening</option>
              <option value="both">Both</option>
            </select>
          </div>
        )}
        {kind === 'quran' && (
          <div className="field">
            <label className="field__label" htmlFor="g-pages">Pages a day</label>
            <input id="g-pages" className="input" type="number" min={1} max={604} inputMode="numeric" value={pages} onChange={(e) => setPages(e.target.value === '' ? '' : Number(e.target.value))} />
          </div>
        )}
        <div className="field">
          <label className="field__label" htmlFor="g-target">Number of days</label>
          <input id="g-target" className="input" type="number" min={1} max={365} inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value === '' ? '' : Number(e.target.value))} aria-invalid={Boolean(err)} aria-describedby="g-err" />
        </div>
        <div id="g-err" aria-live="polite">{err && <div className="field__error">{err}</div>}</div>
        <div className="tiny muted">Counts days from today. Only for you; no points.</div>
        <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Adding…' : 'Add goal'}</button>
      </form>
    </Dialog>
  );
}

function PersonalTab() {
  const list = useAsync(() => api.list('personal'), []);
  const [kind, setKind] = useState(null);
  const tones = { namaz: 'accent', jamaat: undefined, zikr: 'gold', quran: undefined };
  return (
    <>
      <p className="small muted">Only for you. Pick a goal from Namaz, Jamaat, Zikr or Quran.</p>
      {list.loading && <LoadingBlocks heights={[90, 90]} />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {!list.loading && !list.error && list.data.length === 0 && (
        <Card><EmptyState icon="star" title="No goals yet">Add one below. Progress is counted from your logs.</EmptyState></Card>
      )}
      {!list.loading && !list.error && list.data.map((c) => (
        <Card key={c.id}>
          <div className="row row--between">
            <div>
              <div className="eyebrow eyebrow--light">{c.kind}{c.completed ? ' · done' : ''}</div>
              <div className="strong">{c.title}</div>
            </div>
            <span className="small muted">{progressLabel(c)}</span>
          </div>
          <ProgressBar value={c.progress} max={c.target} tone={tones[c.kind]} label={`${c.title} progress`} />
        </Card>
      ))}
      <h2 style={{ marginTop: 6 }}>Add a goal</h2>
      <div className="grid-2">
        {KINDS.map((k) => (
          <button key={k.kind} type="button" className="tile" onClick={() => setKind(k.kind)}>
            <span className="strong">{k.title}</span>
            <span className="small muted">{k.sub}</span>
          </button>
        ))}
      </div>
      {kind && <PersonalForm kind={kind} onClose={() => setKind(null)} onCreated={() => { setKind(null); list.reload({ silent: true }); }} />}
    </>
  );
}

export default function Challenges() {
  const { pathname } = useLocation();
  const personal = pathname.startsWith('/challenges/personal');
  return (
    <>
      <PageHead title="Challenges" />
      <ChallengeTabs />
      {personal ? <PersonalTab /> : <FriendTab />}
    </>
  );
}
