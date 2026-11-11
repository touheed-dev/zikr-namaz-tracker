import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFriends } from '../hooks/useFriends.js';
import { useAsync } from '../hooks/useAsync.js';
import { friends as friendsApi } from '../api/index.js';
import { Card, Tabs, Avatar, LoadingBlocks, ErrorState, EmptyState, Dialog, Icon, Skeleton } from '../components/ui/index.jsx';
import { NamazHeatmap, NamazLegend } from '../components/heatmap/Heatmaps.jsx';
import { PageHead } from '../components/layout/AppShell.jsx';
import { formatPoints } from '../utils/points.js';
import { useAuth, useToday } from '../context/AuthContext.jsx';

const PERIODS = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
];

function HeadToHead({ rows }) {
  const meIdx = rows.findIndex((r) => r.isMe);
  if (meIdx < 0 || rows.length < 2) return null;
  const me = rows[meIdx];
  const other = meIdx === 0 ? rows[1] : rows[meIdx - 1];
  const diff = me.points - other.points;
  let line;
  if (diff > 0) line = `You are ${formatPoints(diff)} points ahead. Keep it steady.`;
  else if (diff === 0) line = 'Level on points. One Jamaat prayer (+10) puts you in front.';
  else {
    const n = Math.ceil(-diff / 10);
    line = `You are ${formatPoints(-diff)} points behind. ${n} Jamaat ${n === 1 ? 'prayer closes' : 'prayers close'} the gap.`;
  }
  return (
    <Card className="card--deep">
      <div className="small muted">Head to head · You vs {other.name}</div>
      <div className="row row--between">
        <span className="num" style={{ fontSize: 26 }}>{formatPoints(me.points)} <span className="small muted">pts</span></span>
        <span className="num" style={{ fontSize: 26 }}>{formatPoints(other.points)}</span>
      </div>
      <div className="small">{line}</div>
    </Card>
  );
}

function FriendSheet({ friend, onClose, onRemove, busy }) {
  const today = useToday();
  const info = useAsync(async () => {
    const [heat, quranStreak, badges] = await Promise.all([
      friendsApi.heatmap(friend.id, 21), friendsApi.quranStreak(friend.id), friendsApi.badges(friend.id),
    ]);
    return { heat, quranStreak, badges };
  }, [friend.id]);
  const d = info.data;
  return (
    <Dialog title={friend.name} onClose={onClose}>
      <div className="grid-2">
        <div className="stat"><div className="stat__label">Points</div><div className="stat__value stat__value--sm">{formatPoints(friend.points)}</div></div>
        <div className="stat"><div className="stat__label">Streak</div><div className="stat__value stat__value--sm">{friend.streak} days</div></div>
      </div>
      {info.loading && <Skeleton height={150} />}
      {info.error && <ErrorState error={info.error} onRetry={info.reload} />}
      {d && (
        <>
          {d.heat ? (
            <Card className="card--deep" title="Namaz · last 21 days">
              <NamazHeatmap entries={d.heat} endISO={today} days={21} today={today} />
              <NamazLegend />
            </Card>
          ) : <p className="small muted">{friend.name} keeps their heatmap private.</p>}
          {d.quranStreak !== null && d.quranStreak !== undefined
            ? <p>Quran streak: <strong>{d.quranStreak} days</strong></p>
            : <p className="small muted">Quran streak is private.</p>}
          {d.badges?.length > 0 && (
            <div className="row row--wrap">{d.badges.map((b) => <span key={b.id} className="chip chip--light">{b.name}</span>)}</div>
          )}
        </>
      )}
      <button type="button" className="btn btn--danger" disabled={busy} onClick={() => onRemove(friend)}>Remove friend</button>
    </Dialog>
  );
}

export default function Friends() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('week');
  const { board, requests, invite, accept, remove, busy } = useFriends(period);
  const [email, setEmail] = useState('');
  const [inviteMsg, setInviteMsg] = useState(null);
  const [inviteErr, setInviteErr] = useState(null);
  const [open, setOpen] = useState(null);
  const inputRef = useRef(null);

  const submitInvite = async (e) => {
    e.preventDefault();
    setInviteMsg(null);
    setInviteErr(null);
    const v = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
      setInviteErr('Enter a valid email address.');
      return;
    }
    if (v.toLowerCase() === (user?.email || '').toLowerCase()) {
      setInviteErr('You cannot invite yourself.');
      return;
    }
    try {
      const res = await invite(v);
      setInviteMsg(res?.message || 'If that person has an account, they will get your request.');
      setEmail('');
    } catch (err) {
      setInviteErr(err.message);
    }
  };

  const rows = board.data || [];
  const inc = requests.data?.incoming || [];
  const out = requests.data?.outgoing || [];

  return (
    <>
      <PageHead
        title="Friends"
        aside={(
          <button type="button" className="btn btn--sm" onClick={() => inputRef.current?.focus()}>
            <Icon name="plus" size={16} /> Add friend
          </button>
        )}
      />
      <Tabs label="Leaderboard period" items={PERIODS} value={period} onChange={setPeriod} />

      {board.loading && <LoadingBlocks heights={[110, 300]} />}
      {!board.loading && board.error && <ErrorState error={board.error} onRetry={board.reload} />}
      {!board.loading && !board.error && (
        <>
          <HeadToHead rows={rows} />
          <Card>
            {rows.length <= 1 && (
              <EmptyState icon="users" title="Just you for now">
                Add a friend by email to compare points and streaks. They only see your name, points and streak.
              </EmptyState>
            )}
            <ol className="list" aria-label="Leaderboard" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {rows.map((r, i) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`list-row list-row--btn ${r.isMe ? 'list-row--me' : ''}`}
                    onClick={() => !r.isMe && setOpen(r)}
                    disabled={r.isMe}
                    aria-label={`${i + 1}. ${r.isMe ? 'You' : r.name}, ${r.points} points, ${r.streak} day streak`}
                  >
                    <span className="rank">{i + 1}</span>
                    <Avatar name={r.name} />
                    <span className="grow">
                      <span className="strong">{r.isMe ? 'You' : r.name}</span><br />
                      <span className="small muted">{r.streak} day streak</span>
                    </span>
                    <span className="strong" style={{ color: 'var(--light)' }}>{formatPoints(r.points)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </Card>
        </>
      )}

      {requests.error && <ErrorState error={requests.error} onRetry={requests.reload} title="Could not load requests" />}
      {inc.length > 0 && (
        <Card title="Requests">
          {inc.map((r) => (
            <div key={r.id} className="list-row">
              <Avatar name={r.name} />
              <span className="grow"><span className="strong">{r.name}</span><br /><span className="small muted">{r.email}</span></span>
              <button type="button" className="btn btn--primary btn--sm" disabled={Boolean(busy)} onClick={() => accept(r.id).catch(() => {})}>Accept</button>
              <button type="button" className="btn btn--ghost btn--sm" disabled={Boolean(busy)} aria-label={`Decline ${r.name}`} onClick={() => remove(r.id, 'Request declined').catch(() => {})}>
                <Icon name="close" size={18} />
              </button>
            </div>
          ))}
        </Card>
      )}

      <Card title="Add a friend">
        <form onSubmit={submitInvite} className="stack" noValidate>
          <div className="field">
            <label className="field__label" htmlFor="friend-email">Their email</label>
            <input
              id="friend-email"
              ref={inputRef}
              className="input"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(inviteErr)}
              aria-describedby="invite-status"
            />
          </div>
          <div id="invite-status" aria-live="polite">
            {inviteErr && <div className="field__error">{inviteErr}</div>}
            {inviteMsg && <div className="notice notice--ok">{inviteMsg}</div>}
          </div>
          <button type="submit" className="btn btn--primary" disabled={busy === 'invite'}>
            {busy === 'invite' ? 'Sending…' : 'Send request'}
          </button>
        </form>
        {out.length > 0 && (
          <div>
            <div className="small muted">Sent</div>
            {out.map((r) => (
              <div key={r.id} className="list-row">
                <span className="grow small">{r.email}</span>
                <button type="button" className="btn btn--ghost btn--sm" disabled={Boolean(busy)} onClick={() => remove(r.id, 'Request cancelled').catch(() => {})}>Cancel</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Link to="/challenges" className="btn btn--block">Challenges with friends</Link>

      <Card className="card--tight">
        <div className="eyebrow">How points work</div>
        <p className="small">
          Jamaat +10 · Alone +4 · Both azkar +3 · Full-day bonus +5 · Qaza made up +2. Points count only if you mark
          within 3 days, and edited entries earn 0. Quran and nafl never add points. Friends see only your name, points and streak.
        </p>
      </Card>

      {open && (
        <FriendSheet
          friend={open}
          busy={Boolean(busy)}
          onClose={() => setOpen(null)}
          onRemove={async (f) => {
            setOpen(null);
            await remove(f.id, `${f.name} removed`).catch(() => {});
          }}
        />
      )}
    </>
  );
}
