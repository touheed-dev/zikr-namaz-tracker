import { useState, useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth, useToday } from '../../context/AuthContext.jsx';
import { useMode } from '../../context/ModeContext.jsx';
import {
  shouldShowGlobalAnnouncement,
  isGlobalAnnouncementDismissed,
} from '../../utils/announcements.js';
import { Icon, Avatar } from '../ui/index.jsx';
import { NORMAL_TABS, RAMADAN_TABS, MORE_ROUTES } from './AppShell.jsx';

export function Sidebar() {
  const { ramadanActive } = useMode();
  const { user } = useAuth();
  const today = useToday();
  const location = useLocation();
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

  const showGlobalDot = shouldShowGlobalAnnouncement({
    today,
    optedIn: Boolean(user?.settings?.showOnGlobal),
    dismissed,
  });

  const isMoreRoute = MORE_ROUTES.some(
    (p) => location.pathname === p || location.pathname.startsWith(`${p}/`),
  );

  const tabs = ramadanActive ? RAMADAN_TABS : NORMAL_TABS;

  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="sidebar__brand-wrap">
        <Link to="/" className="sidebar__brand" aria-label="Zikr & Namaz Home">
          <img src="/icon.svg" width={32} height={32} alt="" className="sidebar__logo" />
          <span className="sidebar__title">Zikr &amp; Namaz</span>
        </Link>
      </div>

      <nav className="sidebar__nav" aria-label="Sidebar">
        {tabs.map((t) => {
          const showDot = t.to === '/friends' && showGlobalDot;
          const isMoreTab = t.to === '/more';
          const isActive = isMoreTab
            ? isMoreRoute
            : (t.end
              ? location.pathname === t.to
              : (location.pathname === t.to || (t.to !== '/' && location.pathname.startsWith(`${t.to}/`))));

          return (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={() => `sidebar__link ${isActive ? 'active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              aria-label={showDot ? `${t.label}, new feature` : undefined}
            >
              <span className="sidebar__link-icon">
                <Icon name={t.icon} size={20} />
                {showDot && <span className="sidebar__dot" aria-hidden="true" />}
              </span>
              <span className="sidebar__link-label">{t.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {user && (
        <div className="sidebar__footer">
          <Link
            to="/profile"
            className={`sidebar__user ${location.pathname === '/profile' ? 'active' : ''}`}
            aria-current={location.pathname === '/profile' ? 'page' : undefined}
            aria-label="Profile and settings"
          >
            <Avatar name={user.name || user.email || 'User'} small />
            <div className="sidebar__user-info">
              <div className="sidebar__user-name">{user.name || 'Account'}</div>
              <div className="sidebar__user-sub">
                {user.username ? `@${user.username}` : user.email || ''}
              </div>
            </div>
          </Link>
        </div>
      )}
    </aside>
  );
}
