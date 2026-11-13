import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useToday } from '../../context/AuthContext.jsx';
import {
  shouldShowGlobalAnnouncement,
  isGlobalAnnouncementDismissed,
  dismissGlobalAnnouncement,
} from '../../utils/announcements.js';
import { Icon } from './Icon.jsx';

export function GlobalAnnouncementCard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const today = useToday();
  const [dismissed, setDismissed] = useState(() => isGlobalAnnouncementDismissed());

  useEffect(() => {
    const handler = () => setDismissed(isGlobalAnnouncementDismissed());
    window.addEventListener('zn:announce_dismissed', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('zn:announce_dismissed', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const show = shouldShowGlobalAnnouncement({
    today,
    optedIn: Boolean(user?.settings?.showOnGlobal),
    dismissed,
  });

  if (!show) return null;

  const handleDismiss = () => {
    dismissGlobalAnnouncement();
    setDismissed(true);
  };

  const handleTakeALook = () => {
    dismissGlobalAnnouncement();
    setDismissed(true);
    navigate('/friends?tab=global');
  };

  return (
    <div className="card card--gold" role="status" style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          width: 44,
          height: 44,
          minWidth: 44,
          minHeight: 44,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        <Icon name="close" size={18} />
      </button>
      <div className="row" style={{ alignItems: 'flex-start', gap: 12, paddingRight: 36 }}>
        <span style={{ color: 'var(--gold)', marginTop: 2 }}>
          <Icon name="sparkle" size={20} />
        </span>
        <div className="stack" style={{ gap: 4 }}>
          <div className="eyebrow eyebrow--gold">New</div>
          <div className="strong">Global leaderboard</div>
          <div className="small muted">
            Show yourself on the leaderboard and add friends with a tap.
          </div>
          <div style={{ marginTop: 6 }}>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={handleTakeALook}
            >
              Take a look
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
