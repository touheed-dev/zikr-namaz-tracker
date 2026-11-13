import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase, isConfigured } from '../lib/supabase.js';
import { auth, profile } from '../api/index.js';
import { setAuthExpiredHandler } from '../api/client.js';
import { todayInTimeZone } from '../utils/dates.js';
import { useNow } from '../hooks/useNow.js';

export const DEFAULT_SETTINGS = {
  city: 'Mumbai', country: 'India', method: 1, asr: 'standard',
  azanAlert: true, jamaatNudge: true, azkarReminder: false,
  smartFix: true, smartFixChoice: null,
  shareStats: true, shareHeatmap: false, shareQuran: false,
  weeklyReport: true, showHadith: true,
  showOnGlobal: false,
};

const AuthContext = createContext(null);

function normalise(user) {
  if (!user) return null;
  return { ...user, settings: { ...DEFAULT_SETTINGS, ...(user.settings || {}) } };
}

export function AuthProvider({ children }) {
  const [status, setStatus] = useState(isConfigured ? 'loading' : 'signedOut');
  const [user, setUser] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;
  const userRef = useRef(null);
  userRef.current = user;

  const signedOut = useCallback(() => {
    setUser(null);
    setStatus('signedOut');
  }, []);

  const loadUser = useCallback(async () => {
    setLoadError(null);
    try {
      const u = normalise(await auth.me());
      setUser(u);
      setStatus('signedIn');
      return u;
    } catch (err) {
      if (err.auth || err.message === 'Not signed in') {
        signedOut();
      } else {
        setLoadError(err);
        setStatus('error');
      }
      return null;
    }
  }, [signedOut]);

  // Expired / invalid session anywhere in the app -> clear state, go to /login
  useEffect(() => {
    setAuthExpiredHandler(() => {
      if (!userRef.current) return;
      supabase?.auth.signOut({ scope: 'local' }).catch(() => {});
      signedOut();
      const from = locationRef.current;
      navigate('/login', { replace: true, state: { from, expired: true } });
    });
    return () => setAuthExpiredHandler(null);
  }, [navigate, signedOut]);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data?.session) loadUser();
      else signedOut();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Never await supabase calls inside this callback (supabase-js deadlock);
      // defer them to the next tick instead.
      if (event === 'SIGNED_OUT') {
        signedOut();
      } else if (event === 'PASSWORD_RECOVERY') {
        setTimeout(() => navigate('/reset-password', { replace: true }), 0);
      } else if (event === 'SIGNED_IN' && session && !userRef.current) {
        setTimeout(() => { if (active) loadUser(); }, 0);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadUser, navigate, signedOut]);

  const login = useCallback(async (email, password) => {
    const u = normalise(await auth.login(email, password));
    setUser(u);
    setStatus('signedIn');
    return u;
  }, []);

  const signup = useCallback(async (name, email, password) => {
    const res = await auth.signup(name, email, password);
    if (res?.needsConfirmation) return res;
    const u = normalise(res);
    setUser(u);
    setStatus('signedIn');
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await auth.logout();
    } finally {
      signedOut();
      navigate('/login', { replace: true });
    }
  }, [navigate, signedOut]);

  /**
   * Optimistic settings update. On failure only the keys in this patch are
   * rolled back, so a parallel successful toggle is not undone.
   */
  const saveSettings = useCallback(async (patch) => {
    const before = userRef.current;
    if (!before) throw new Error('Not signed in');
    const prevValues = {};
    const settingsPatch = {};
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'name' || k === 'timezone') continue;
      prevValues[k] = before.settings[k];
      settingsPatch[k] = v;
    }
    setUser((u) => (u ? {
      ...u,
      ...(patch.name ? { name: patch.name } : {}),
      ...(patch.timezone ? { timezone: patch.timezone } : {}),
      settings: { ...u.settings, ...settingsPatch },
    } : u));
    try {
      const updated = normalise(await profile.update(patch));
      setUser((u) => (u ? { ...updated, settings: { ...u.settings, ...updated.settings } } : u));
      return updated;
    } catch (err) {
      setUser((u) => (u ? {
        ...u,
        name: patch.name ? before.name : u.name,
        timezone: patch.timezone ? before.timezone : u.timezone,
        settings: { ...u.settings, ...prevValues },
      } : u));
      throw err;
    }
  }, []);

  const value = useMemo(() => ({
    status, user, loadError, login, signup, logout, saveSettings, reload: loadUser, setUser: (u) => setUser(normalise(u)),
  }), [status, user, loadError, login, signup, logout, saveSettings, loadUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Today's date in the user's own timezone (same rule as the server). */
export function useToday() {
  const { user } = useAuth();
  const now = useNow(30000);
  return todayInTimeZone(user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone, now);
}
