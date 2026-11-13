import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { PageHead } from '../components/layout/AppShell.jsx';
import { Card, Icon } from '../components/ui/index.jsx';

// Feature flag: Prayer times route (/times) will be added in a future update.
const ENABLE_PRAYER_TIMES = false;

const MORE_LINKS = [
  {
    to: '/profile',
    title: 'Profile & settings',
    hint: 'Themes, prayer location, reminders and privacy',
    icon: 'settings',
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
    hint: 'Join community challenges and earn bonus points',
    icon: 'target',
  },
  {
    to: '/times',
    title: 'Prayer times',
    hint: 'Daily prayer times by city and calculation method',
    icon: 'clock',
    enabled: ENABLE_PRAYER_TIMES,
  },
].filter((item) => item.enabled !== false);

export default function More() {
  const { user } = useAuth();
  const subTitle = user?.username ? `${user.name} · @${user.username}` : (user?.name || '');

  return (
    <>
      <PageHead title="More" sub={subTitle} />

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
          {MORE_LINKS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="list-row more-row"
              style={{ textDecoration: 'none' }}
            >
              <div className="more-row__icon-wrap">
                <Icon name={item.icon} size={22} />
              </div>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="strong" style={{ fontSize: 15 }}>
                  {item.title}
                </div>
                <div className="small muted">{item.hint}</div>
              </div>
              <Icon name="chevronRight" size={20} className="muted" />
            </Link>
          ))}
        </nav>
      </Card>
    </>
  );
}
