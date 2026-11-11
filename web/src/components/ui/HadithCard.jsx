import { useState } from 'react';
import { useAuth, useToday } from '../../context/AuthContext.jsx';
import { pickHadith, HADITH_SCREENS, dismissKey } from '../../utils/hadith.js';
import { getItem, setItem } from '../../utils/storage.js';
import { Icon } from './Icon.jsx';

/**
 * Small hadith card. Deterministic per day (no flicker), dismissible for the
 * day, and hidden entirely when the user switches "Show hadith cards" off.
 * `screen` picks the category set; `variant` lets a screen swap in another
 * set (e.g. Today shows the qaza hadith after the Qaza button is used).
 */
export function HadithCard({ screen, variant }) {
  const { user } = useAuth();
  const today = useToday();
  const cfg = HADITH_SCREENS[variant || screen];
  const key = dismissKey(screen, today);
  const [dismissedFor, setDismissedFor] = useState(() => (getItem(key) === '1' ? key : null));

  if (!cfg || user?.settings?.showHadith === false) return null;
  if (dismissedFor === key || getItem(key) === '1') return null;
  const h = pickHadith(cfg.categories, today);
  if (!h) return null;

  const dismiss = () => {
    setItem(key, '1');
    setDismissedFor(key);
  };

  return (
    <aside className="hadith" aria-label={cfg.label} data-hadith-id={h.id}>
      <div className="row row--between">
        <span className="eyebrow eyebrow--light">{cfg.label}</span>
        <button type="button" className="btn btn--ghost btn--sm hadith__close" onClick={dismiss} aria-label="Hide hadith for today">
          <Icon name="close" size={18} />
        </button>
      </div>
      <p className="hadith__ar" dir="rtl" lang="ar">{h.ar}</p>
      <p className="hadith__en">{h.en}</p>
      <p className="hadith__src">{h.src}</p>
    </aside>
  );
}
