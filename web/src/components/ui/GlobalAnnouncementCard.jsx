import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, useToday } from '../../context/AuthContext.jsx';
import { daysBetween } from '../../utils/dates.js';
import { getItem, setItem } from '../../utils/storage.js';
import { Icon } from './Icon.jsx';

const GLOBAL_LAUNCH = '2026-11-13';
const ANNOUNCE_KEY = 'zn_announce_global';

export function GlobalAnnouncementCard() {
  const { user } = useAuth();
  const today = useToday();
  const [dismissed, setDismissed] = useState(() => getItem(ANNOUNCE_KEY) === '1');

  if (dismissed) return null;
  if (user?.settings?.showOnGlobal) return null;

  const diff = daysBetween(GLOBAL_LAUNCH, today);
  if (diff < 0 || diff >= 7) return null;

  const dismiss = () => {
    setItem(ANNOUNCE_KEY, '1');
    setDismissed(true);
  };

  return (
    <div className="notice row row--between" role="status" style={{ alignItems: 'flex-start' }}>
      <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
        <Icon name="sparkle" size={20} />
        <div>
          <div className="strong">New: Global leaderboard</div>
          <div className="small muted">
            Choose a username to show yourself and add people without their email.
          </div>
          <div style={{ marginTop: 6 }}>
            <Link to="/friends?tab=global" className="btn btn--sm btn--primary">Take a look</Link>
          </div>
        </div>
      </div>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={dismiss}
        aria-label="Dismiss announcement"
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}

