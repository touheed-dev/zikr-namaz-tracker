import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { ProtectedLayout, PublicOnlyLayout } from './components/layout/AppShell.jsx';
import { LoadingBlocks } from './components/ui/index.jsx';
import { Login, Signup, ForgotPassword, ResetPassword, NotFound } from './pages/Auth.jsx';
import Today from './pages/Today.jsx';

// Less-used screens are split out so Today loads fast.
const Streak = lazy(() => import('./pages/Streak.jsx'));
const History = lazy(() => import('./pages/History.jsx'));
const Quran = lazy(() => import('./pages/Quran.jsx'));
const Nafl = lazy(() => import('./pages/Nafl.jsx'));
const Friends = lazy(() => import('./pages/Friends.jsx'));
const Challenges = lazy(() => import('./pages/Challenges.jsx'));
const Badges = lazy(() => import('./pages/Badges.jsx'));
const Report = lazy(() => import('./pages/Report.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const RamadanMap = lazy(() => import('./pages/RamadanMap.jsx'));
const More = lazy(() => import('./pages/More.jsx'));

const TITLES = {
  '/': 'Today', '/streak': 'Track', '/history': 'Log and edit', '/quran': 'Quran', '/nafl': 'Nafl',
  '/friends': 'Friends', '/challenges': 'Challenges', '/challenges/personal': 'Personal challenges',
  '/badges': 'Badges', '/report': 'Weekly report', '/profile': 'Profile', '/ramadan/map': 'Ramadan map',
  '/more': 'More',
  '/login': 'Sign in', '/signup': 'Sign up', '/forgot-password': 'Forgot password', '/reset-password': 'Reset password',
};

function RouteEffects() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = `${TITLES[pathname] || 'Not found'} · Zikr & Namaz`;
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <RouteEffects />
      <Suspense fallback={<LoadingBlocks heights={[60, 120, 260]} />}>
        <Routes>
          <Route element={<PublicOnlyLayout />}>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
          </Route>
          <Route element={<ProtectedLayout />}>
            <Route index element={<Today />} />
            <Route path="/streak" element={<Streak />} />
            <Route path="/history" element={<History />} />
            <Route path="/quran" element={<Quran />} />
            <Route path="/nafl" element={<Nafl />} />
            <Route path="/friends" element={<Friends />} />
            <Route path="/challenges" element={<Challenges />} />
            <Route path="/challenges/personal" element={<Challenges />} />
            <Route path="/badges" element={<Badges />} />
            <Route path="/report" element={<Report />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/ramadan/map" element={<RamadanMap />} />
            <Route path="/more" element={<More />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}
