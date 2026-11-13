import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getItem, setItem } from '../utils/storage.js';
import { PALETTES, DEFAULT_THEME, THEME_KEYS } from '../utils/themes.js';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = getItem('zn_theme', DEFAULT_THEME);
    return PALETTES[saved] ? saved : DEFAULT_THEME;
  });

  const setTheme = useCallback((next) => {
    if (!PALETTES[next]) return;
    setItem('zn_theme', next);
    setThemeState(next);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.palette = theme;
    if (root.dataset.theme !== 'ramadan') {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta && PALETTES[theme]) {
        meta.setAttribute('content', PALETTES[theme].colors.bg);
      }
    }
  }, [theme]);

  const value = useMemo(() => ({
    theme,
    setTheme,
    palette: PALETTES[theme],
    palettes: PALETTES,
    themeKeys: THEME_KEYS,
  }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
