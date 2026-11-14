import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, useToday } from '../context/AuthContext.jsx';
import { PageHead } from '../components/layout/AppShell.jsx';
import { Card, Icon } from '../components/ui/index.jsx';
import {
  getActiveNavDots,
  getDismissedAnnouncementIds,
  hasUnseenReleases,
} from '../utils/announcements.js';

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.5.0';

const MORE_LINKS = [
  {
    to: '/profile',
    title: 'Profile & settings',
    hint: 'Themes, prayer location, reminders and privacy',
    icon: 'settings',
  },
  {
    to: '/whats-new',
    title: "What's new",
    hint: `Version ${APP_VERSION}`,
    icon: 'sparkle',
  },
  {
    to: '/times',
    title: 'Prayer times',
    hint: 'Daily timetable, location and calculation settings',
    icon: 'clock',
  },
  {
    to: '/nafl',
    title: 'Nafl',
    hint: 'Tahajjud, Duha, Ishraq and voluntary prayers',
    icon: 'sparkle',
  },
  {
    to: '/history',
    title: 'Log and edit',
    hint: 'View past logs, make up missed prayers or edit',
    icon: 'edit',
  },
  {
    to: '/report',
    title: 'Weekly report',
    hint: 'Your private 7-day habit breakdown and insights',
    icon: 'chart',
  },
  {
    to: '/badges',
    title: 'Badges',
    hint: 'Milestone badges earned for prayer streaks',
    icon: 'award',
  },
  {
    to: '/challenges',
    title: 'Challenges',
    hint: 'Goals with friends or just for you',
    icon: 'target',
  },
];

export default function More() {
  const { user } = useAuth();
  const today = useToday();
  const [dismissedIds, setDismissedIds] = useState(() => getDismissedAnnouncementIds());
  const [unseen, setUnseen] = useState(() => hasUnseenReleases());

  useEffect(() => {
    const handleDismissed = () => setDismissedIds(getDismissedAnnouncementIds());
    const handleSeen = () => setUnseen(hasUnseenReleases());
    const handleStorage = () => {
      setDismissedIds(getDismissedAnnouncementIds());
      setUnseen(hasUnseenReleases());
    };
    window.addEventListener('zn:announce_dismissed', handleDismissed);
    window.addEventListener('zn:release_seen', handleSeen);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('zn:announce_dismissed', handleDismissed);
      window.removeEventListener('zn:release_seen', handleSeen);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const activeNavDots = getActiveNavDots({
    today,
    user,
    dismissedIds,
  });

  return (
    <>
      <PageHead title="More" />

      <div className="card card--deep" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gap: 14, alignItems: 'center' }}>
          <div
            className="avatar"
            style={{
              width: 48,
              height: 48,
              fontSize: 20,
              background: 'var(--accent)',
              color: 'var(--accent-text)',
            }}
            aria-hidden="true"
          >
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="strong" style={{ fontSize: 17, lineHeight: 1.3 }}>
              {user?.name}
            </div>
            <div className="small muted">
              {user?.username ? `@${user.username}` : user?.email}
            </div>
          </div>
          <Link to="/profile" className="btn btn--sm btn--ghost">
            Settings
          </Link>
        </div>
      </div>

      <Card className="card--tight">
        <nav aria-label="More options" className="list">
          {MORE_LINKS.map((item) => {
            const hasDot = (item.to === '/whats-new' && unseen) || activeNavDots.has(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className="list-row more-row"
                style={{ textDecoration: 'none' }}
                aria-label={hasDot ? `${item.title}, new updates` : undefined}
              >
                <div className="more-row__icon-wrap">
                  <Icon name={item.icon} size={22} />
                </div>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row" style={{ alignItems: 'center', gap: 6 }}>
                    <div className="strong" style={{ fontSize: 15 }}>
                      {item.title}
                    </div>
                    {hasDot && (
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: 'var(--gold)',
                          display: 'inline-block',
                          flexShrink: 0,
                        }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className="small muted">{item.hint}</div>
                </div>
                <Icon name="chevronRight" size={20} className="muted" />
              </Link>
            );
          })}
        </nav>
      </Card>

      <div className="tiny muted center mt-16 pb-16">
        Version {APP_VERSION}
        {typeof __BUILD__ !== 'undefined' ? ` · build ${__BUILD__}` : ''}
      </div>
    </>
  );
}
