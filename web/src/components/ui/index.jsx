import { useEffect, useId, useRef } from 'react';
import { Icon } from './Icon.jsx';

export { Icon };
export { QuranMiniPlayer } from './QuranMiniPlayer.jsx';

export function Card({ title, aside, children, className = '', as: Tag = 'section', ...rest }) {
  return (
    <Tag className={`card ${className}`} {...rest}>
      {(title || aside) && (
        <div className="card__head">
          {title && <h2 className="card__title">{title}</h2>}
          {aside && <div className="small muted">{aside}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}

export function Stat({ label, value, sub, small }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className={`stat__value ${small ? 'stat__value--sm' : ''}`}>{value}</div>
      {sub && <div className="stat__sub">{sub}</div>}
    </div>
  );
}

/** role="switch" toggle with a visible label */
export function Switch({ checked, onChange, label, hint, disabled, id }) {
  const autoId = useId();
  const sid = id || autoId;
  return (
    <div className="setting">
      <div className="grow">
        <div className="setting__label" id={`${sid}-label`}>{label}</div>
        {hint && <div className="setting__hint" id={`${sid}-hint`}>{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        className="switch"
        aria-checked={Boolean(checked)}
        aria-labelledby={`${sid}-label`}
        aria-describedby={hint ? `${sid}-hint` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

export function Tabs({ items, value, onChange, label }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="tab"
          className="tabs__tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, max, tone, label }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} aria-label={label}>
      <div className={`progress__bar ${tone ? `progress__bar--${tone}` : ''}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const AVATAR_COLORS = ['#E9C46A', '#8FD3A8', '#A7C4F2', '#F2B5A7', '#C9B6F2', '#9ED9D3'];

export function Avatar({ name, small }) {
  const n = (name || '?').trim();
  let h = 0;
  for (let i = 0; i < n.length; i += 1) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return (
    <span className={`avatar ${small ? 'avatar--sm' : ''}`} style={{ background: AVATAR_COLORS[h % AVATAR_COLORS.length] }} aria-hidden="true">
      {n.charAt(0).toUpperCase()}
    </span>
  );
}

export function Skeleton({ height = 80, className = '' }) {
  return <div className={`skeleton ${className}`} style={{ height }} aria-hidden="true" />;
}

/** Page-level loading placeholder with fixed heights (no layout shift). */
export function LoadingBlocks({ heights = [84, 260, 120], label = 'Loading' }) {
  return (
    <div className="stack" role="status" aria-live="polite">
      <span className="sr-only">{label}…</span>
      {heights.map((h, i) => <Skeleton key={i} height={h} />)}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Could not load this' }) {
  const message = error?.message || String(error || '');
  return (
    <div className="card state" role="alert">
      <span className="state__icon"><Icon name={/offline/i.test(message) ? 'wifiOff' : 'alert'} size={28} /></span>
      <div className="strong">{title}</div>
      {message && <div className="small muted">{message}</div>}
      {onRetry && (
        <button type="button" className="btn btn--primary btn--sm" onClick={() => onRetry()}>
          <Icon name="refresh" size={18} /> Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon = 'sparkle', title, children, action }) {
  return (
    <div className="state">
      <span className="state__icon"><Icon name={icon} size={28} /></span>
      {title && <div className="strong">{title}</div>}
      {children && <div className="small muted">{children}</div>}
      {action}
    </div>
  );
}

export function PrivateBanner({ title = 'Only you can see this', children }) {
  return (
    <div className="banner">
      <span className="banner__icon"><Icon name="lock" size={20} /></span>
      <div>
        <div className="strong">{title}</div>
        {children && <div className="small muted">{children}</div>}
      </div>
    </div>
  );
}

/** Accessible modal sheet: focus moves in, Escape closes, focus returns. */
export function Dialog({ title, onClose, children, labelId }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const autoId = useId();
  const id = labelId || autoId;
  useEffect(() => {
    const prev = document.activeElement;
    const first = ref.current?.querySelector('button, [href], input, select, textarea');
    first?.focus();
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (prev && typeof prev.focus === 'function') prev.focus();
    };
  }, []);
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <div className="row row--between">
          <h2 id={id}>{title}</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
