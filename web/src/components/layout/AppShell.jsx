import { Suspense } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useMode } from '../../context/ModeContext.jsx';
import { Icon } from '../ui/Icon.jsx';
import { LoadingBlocks, ErrorState } from '../ui/index.jsx';
import { ErrorBoundary } from './ErrorBoundary.jsx';

const NORMAL_TABS = [
  { to: '/', label: 'Today', icon: 'today', end: true },
  { to: '/streak', label: 'Streak', icon: 'grid' },
  { to: '/quran', label: 'Quran', icon: 'book' },
  { to: '/friends', label: 'Friends', icon: 'users' },
  { to: '/profile', label: 'Profile', icon: 'user' },
];

const RAMADAN_TABS = [
  { to: '/', label: 'Ramadan', icon: 'moon', end: true },
  { to: '/ramadan/map', label: '30 days', icon: 'calendar' },
  { to: '/quran', label: 'Quran', icon: 'book' },
  { to: '/friends', label: 'Friends', icon: 'users' },
  { to: '/profile', label: 'Profile', icon: 'user' },
];

export function BottomNav() {
  const { ramadanActive } = useMode();
  const tabs = ramadanActive ? RAMADAN_TABS : NORMAL_TABS;
  return (
    <nav className="bottom-nav" aria-label="Main">
      <div className="bottom-nav__inner">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className="bottom-nav__link">
            <Icon name={t.icon} size={22} />
            <span>{t.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/** Protected layout: signed-out users go to /login and come back afterwards. */
export function ProtectedLayout() {
  const { status, loadError, reload } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <main className="page" id="main"><LoadingBlocks heights={[70, 84, 300, 90]} /></main>
    );
  }
  if (status === 'error') {
    return (
      <main className="page" id="main"><ErrorState error={loadError} onRetry={reload} title="Could not load your account" /></main>
    );
  }
  if (status !== 'signedIn') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to content</a>
      <main className="page" id="main" tabIndex={-1}>
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<LoadingBlocks heights={[60, 120, 260]} />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <BottomNav />
    </div>
  );
}

/** Auth pages: signed-in users are sent home. */
export function PublicOnlyLayout() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'signedIn' && location.pathname !== '/reset-password') {
    const to = location.state?.from?.pathname || '/';
    return <Navigate to={to} replace />;
  }
  return (
    <main className="page page--auth" id="main">
      <Outlet />
    </main>
  );
}

export function PageHead({ title, eyebrow, aside, sub }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <div className="small muted mt-8">{sub}</div>}
      </div>
      {aside}
    </header>
  );
}
