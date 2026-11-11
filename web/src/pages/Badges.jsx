import { useState } from 'react';
import { badges as api } from '../api/index.js';
import { useAsync } from '../hooks/useAsync.js';
import { Icon, LoadingBlocks, ErrorState, EmptyState, ProgressBar } from '../components/ui/index.jsx';
import { PageHead } from '../components/layout/AppShell.jsx';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'namaz', label: 'Namaz' },
  { value: 'quran', label: 'Quran' },
  { value: 'private', label: 'Private' },
];

export default function Badges() {
  const list = useAsync(() => api.list(), []);
  const [filter, setFilter] = useState('all');
  const all = list.data || [];
  const shown = all.filter((b) => {
    if (filter === 'all') return true;
    if (filter === 'private') return b.visibility === 'private';
    return b.group === filter;
  });
  const earned = all.filter((b) => b.earned).length;

  return (
    <>
      <PageHead title="Badges" aside={list.data ? <span className="small muted">{earned} of {all.length} earned</span> : null} />
      <div className="row row--wrap" role="group" aria-label="Filter badges">
        {FILTERS.map((f) => (
          <button key={f.value} type="button" className="chip chip--btn" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>
      {list.loading && <LoadingBlocks heights={[132, 132, 132]} />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {!list.loading && !list.error && shown.length === 0 && <EmptyState title="No badges here yet" />}
      {!list.loading && !list.error && shown.length > 0 && (
        <ul className="grid-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {shown.map((b) => (
            <li key={b.id} className="badge-card" aria-label={`${b.name}. ${b.earned ? 'Earned' : b.note}. ${b.visibility === 'friends' ? 'Friends see this' : 'Only you'}`}>
              <div className="row row--between">
                <span className={`badge-icon ${b.earned ? (b.visibility === 'private' ? 'badge-icon--gold' : 'badge-icon--earned') : ''}`}>
                  <Icon name={b.earned ? 'check' : 'star'} size={20} />
                </span>
                <span className="tiny muted row" style={{ gap: 4 }}>
                  {b.visibility === 'private' && <Icon name="lock" size={12} />}
                  {b.visibility === 'friends' ? 'Friends see' : 'Only you'}
                </span>
              </div>
              <div className="strong">{b.name}</div>
              <div className="small muted">{b.earned ? 'Earned' : b.note}</div>
              {!b.earned && <ProgressBar value={b.progress} max={b.target} label={`${b.name} progress`} />}
              {!b.earned && <div className="tiny muted">{b.description}</div>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
