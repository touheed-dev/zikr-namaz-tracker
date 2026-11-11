import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getItem, setItem } from '../utils/storage.js';
import { ramadanInfo } from '../utils/hijri.js';
import { toISODate } from '../utils/dates.js';
import { useNow } from '../hooks/useNow.js';

const ModeContext = createContext(null);

const MODES = ['auto', 'off', 'on'];

function readMode() {
  const m = getItem('zn_mode', 'auto');
  return MODES.includes(m) ? m : 'auto';
}

function readOffset() {
  const n = Number(getItem('zn_hijri_offset', '0'));
  return [-1, 0, 1].includes(n) ? n : 0;
}

export function ModeProvider({ children }) {
  const [mode, setModeState] = useState(readMode);
  const [hijriOffset, setOffsetState] = useState(readOffset);
  const now = useNow(60000);
  const today = toISODate(now);

  const ramadan = useMemo(() => {
    try {
      return ramadanInfo(today, hijriOffset);
    } catch {
      return { inRamadan: false, hijri: null };
    }
  }, [today, hijriOffset]);

  const active = mode === 'on' || (mode === 'auto' && ramadan.inRamadan);

  useEffect(() => {
    const root = document.documentElement;
    if (active) root.dataset.theme = 'ramadan';
    else delete root.dataset.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', active ? '#0B1020' : '#0E1B17');
  }, [active]);

  const setMode = useCallback((m) => {
    if (!MODES.includes(m)) return;
    setItem('zn_mode', m);
    setModeState(m);
  }, []);

  const setHijriOffset = useCallback((n) => {
    const v = [-1, 0, 1].includes(Number(n)) ? Number(n) : 0;
    setItem('zn_hijri_offset', String(v));
    setOffsetState(v);
  }, []);

  const value = useMemo(() => ({
    mode, setMode, hijriOffset, setHijriOffset, ramadan, ramadanActive: active,
  }), [mode, setMode, hijriOffset, setHijriOffset, ramadan, active]);

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

export function useMode() {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error('useMode must be used inside ModeProvider');
  return ctx;
}
