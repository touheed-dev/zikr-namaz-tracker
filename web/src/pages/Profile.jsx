import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, useToday } from '../context/AuthContext.jsx';
import { useMode } from '../context/ModeContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { usePrayers } from '../hooks/useLogs.js';
import { useAsync } from '../hooks/useAsync.js';
import { profile, friends as friendsApi } from '../api/index.js';
import { Card, Switch, Icon, Dialog } from '../components/ui/index.jsx';
import { UsernameDialog } from '../components/ui/UsernameDialog.jsx';
import { PageHead } from '../components/layout/AppShell.jsx';
import { METHODS } from '../utils/prayerTimes.js';
import { formatHijri } from '../utils/hijri.js';
import { addDays, weekdayShort, todayISO } from '../utils/dates.js';
import { PRAYER_LABELS } from '../utils/points.js';

function useSetting() {
  const { saveSettings } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(() => new Set());
  const save = async (patch) => {
    const keys = Object.keys(patch);
    setBusy((b) => new Set([...b, ...keys]));
    try {
      await saveSettings(patch);
    } catch (err) {
      if (!err.auth) toast.show(`Not saved: ${err.message}`);
    } finally {
      setBusy((b) => { const n = new Set(b); keys.forEach((k) => n.delete(k)); return n; });
    }
  };
  return { save, busy };
}

function QazaCard() {
  const today = useToday();
  const pr = usePrayers(addDays(today, -6), today);
  const missed = pr.entries.filter((e) => e.status === 'missed').sort((a, b) => (a.date < b.date ? 1 : -1));
  if (pr.loading || pr.error || missed.length === 0) return null;
  const names = missed.slice(0, 3).map((e) => `${PRAYER_LABELS[e.prayer]} (${weekdayShort(e.date)})`);
  return (
    <Card title="Qaza" aside="Made up = +2 pts each">
      <div className="row">
        <span className="num" style={{ fontSize: 24, background: 'var(--inset)', borderRadius: 12, padding: '6px 14px' }}>{missed.length}</span>
        <div className="small">
          <div className="strong">{names.join(' and ')}{missed.length > 3 ? '…' : ''}</div>
          <div className="muted">Shown in gold with a dot on the heatmap once made up. No guilt, just a chance.</div>
        </div>
      </div>
      <Link to={`/history?date=${missed[0].date}`} className="btn">Mark one as made up</Link>
    </Card>
  );
}

function ThemeCard() {
  const { theme, setTheme, palettes } = useTheme();
  const current = palettes[theme] || palettes.forest;

  return (
    <Card title="Theme" aside={current.label}>
      <div className="small muted">Choose your preferred palette on this device.</div>
      <div className="theme-swatches" role="group" aria-label="Theme selection">
        {Object.values(palettes).map((p) => {
          const isSelected = theme === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className="theme-swatch"
              aria-pressed={isSelected}
              aria-label={p.label}
              onClick={() => setTheme(p.id)}
              style={{
                '--swatch-card': p.colors.card,
                '--swatch-accent': p.colors.accent,
                borderColor: isSelected ? p.colors.light : p.colors.line,
              }}
            >
              {isSelected && (
                <Icon
                  name="check"
                  size={16}
                  strokeWidth={2.8}
                  style={{
                    color: p.colorScheme === 'light' ? p.colors.accentText : '#FFFFFF',
                    position: 'relative',
                    zIndex: 1,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="theme-preview">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="strong" style={{ fontSize: 14 }}>{current.label}</div>
            <div className="tiny muted">{current.hint}</div>
          </div>
          <span className="chip chip--green" style={{ fontSize: 11 }}>Active</span>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 4 }}>
          <button type="button" className="btn btn--primary btn--sm" tabIndex={-1} style={{ pointerEvents: 'none' }}>
            Primary
          </button>
          <button type="button" className="btn btn--sm" tabIndex={-1} style={{ pointerEvents: 'none' }}>
            Outline
          </button>
          <span className="chip chip--gold" style={{ fontSize: 11 }}>+10 Jamaat</span>
        </div>
      </div>
    </Card>
  );
}

function LocationCard() {
  const { user } = useAuth();
  const { save, busy } = useSetting();
  const s = user.settings;
  const [city, setCity] = useState(s.city);
  const [country, setCountry] = useState(s.country);
  useEffect(() => { setCity(s.city); setCountry(s.country); }, [s.city, s.country]);
  const dirty = city.trim() !== s.city || country.trim() !== s.country;

  const submit = (e) => {
    e.preventDefault();
    if (!city.trim() || !country.trim()) return;
    save({ city: city.trim(), country: country.trim() });
  };

  return (
    <Card title="Prayer times">
      <form className="stack" onSubmit={submit}>
        <div className="grid-2">
          <div className="field">
            <label className="field__label" htmlFor="city">City</label>
            <input id="city" className="input" value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} autoComplete="address-level2" />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="country">Country</label>
            <input id="country" className="input" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={80} autoComplete="country-name" />
          </div>
        </div>
        {dirty && <button type="submit" className="btn btn--primary" disabled={busy.has('city') || !city.trim() || !country.trim()}>Save location</button>}
      </form>
      <div className="field">
        <label className="field__label" htmlFor="method">Calculation method</label>
        <select id="method" className="select" value={s.method} disabled={busy.has('method')} onChange={(e) => save({ method: Number(e.target.value) })}>
          {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>
      <div>
        <div className="field__label" id="asr-label">Asr</div>
        <div className="row" role="group" aria-labelledby="asr-label">
          {[['standard', 'Standard'], ['hanafi', 'Hanafi']].map(([v, l]) => (
            <button key={v} type="button" className="chip chip--btn" aria-pressed={s.asr === v} disabled={busy.has('asr')} onClick={() => save({ asr: v })}>{l}</button>
          ))}
        </div>
      </div>
      <div className="tiny muted">Times from Aladhan, cached for the day on this device.</div>
    </Card>
  );
}

function AccountCard() {
  const { logout } = useAuth();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState(null);

  const doExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const data = await profile.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zikr-namaz-export-${todayISO()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      if (!e.auth) toast.show(e.message);
    } finally {
      setExporting(false);
    }
  };

  const doDelete = async (e) => {
    e.preventDefault();
    if (typed !== 'DELETE' || deleting) return;
    setDeleting(true);
    setErr(null);
    try {
      await profile.deleteAccount('DELETE');
      await logout();
    } catch (error) {
      setErr(error.message);
      setDeleting(false);
    }
  };

  return (
    <Card title="Account">
      <button type="button" className="btn" onClick={doExport} disabled={exporting}>
        <Icon name="download" size={18} /> {exporting ? 'Preparing…' : 'Export my data (JSON)'}
      </button>
      <button type="button" className="btn" onClick={() => logout()}>
        <Icon name="logout" size={18} /> Sign out
      </button>
      <button type="button" className="btn btn--danger" onClick={() => { setConfirmOpen(true); setTyped(''); setErr(null); }}>
        <Icon name="trash" size={18} /> Delete my account
      </button>
      {confirmOpen && (
        <Dialog title="Delete your account?" onClose={() => !deleting && setConfirmOpen(false)}>
          <form onSubmit={doDelete} className="stack">
            <p className="small">This permanently deletes your account and every log, friend link and challenge. It cannot be undone. Export your data first if you want a copy.</p>
            <div className="field">
              <label className="field__label" htmlFor="confirm-del">Type DELETE to confirm</label>
              <input id="confirm-del" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
            </div>
            {err && <div className="field__error" role="alert">{err}</div>}
            <button type="submit" className="btn btn--danger" disabled={typed !== 'DELETE' || deleting}>
              {deleting ? 'Deleting…' : 'Delete permanently'}
            </button>
          </form>
        </Dialog>
      )}
    </Card>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const today = useToday();
  const { mode, setMode, hijriOffset, setHijriOffset, ramadanActive } = useMode();
  const { save, busy } = useSetting();
  const [usernameDialogOpen, setUsernameDialogOpen] = useState(false);
  const toast = useToast();
  const blockedQuery = useAsync(() => friendsApi.blocked(), []);
  const [unblocking, setUnblocking] = useState(null);

  const s = user.settings;
  const sw = (key, label, hint) => (
    <Switch key={key} label={label} hint={hint} checked={Boolean(s[key])} disabled={busy.has(key)} onChange={(v) => save({ [key]: v })} />
  );

  const handleGlobalSwitch = async (checked) => {
    if (checked && !user.username) {
      setUsernameDialogOpen(true);
      return;
    }
    await save({ showOnGlobal: checked });
  };

  const handleUnblock = async (blockedUser) => {
    if (unblocking) return;
    setUnblocking(blockedUser.id);
    try {
      await friendsApi.unblock(blockedUser.id);
      toast.show(`Unblocked @${blockedUser.username}`);
      blockedQuery.reload({ silent: true });
    } catch (err) {
      if (!err.auth) toast.show(err.message || 'Could not unblock');
    } finally {
      setUnblocking(null);
    }
  };

  const blockedList = blockedQuery.data || [];

  return (
    <>
      <PageHead title="Profile" sub={`${user.name} · ${user.email}`} />

      <QazaCard />

      <ThemeCard />

      <Card title="Ramadan mode" aside={ramadanActive ? 'On now' : 'Off now'}>
        <div className="row" role="group" aria-label="Ramadan mode">
          {[['auto', 'Auto'], ['off', 'Always off'], ['on', 'Always on']].map(([v, l]) => (
            <button key={v} type="button" className="chip chip--btn" aria-pressed={mode === v} onClick={() => setMode(v)}>{l}</button>
          ))}
        </div>
        <div className="small muted">Auto follows the Hijri month of Ramadan.</div>
        <div>
          <div className="field__label" id="hijri-label">Hijri date adjustment (local moon sighting)</div>
          <div className="row" role="group" aria-labelledby="hijri-label">
            {[-1, 0, 1].map((n) => (
              <button key={n} type="button" className="chip chip--btn" aria-pressed={hijriOffset === n} onClick={() => setHijriOffset(n)}>
                {n > 0 ? `+${n}` : n === 0 ? '0' : `−${Math.abs(n)}`} day
              </button>
            ))}
          </div>
          <div className="small muted mt-8">Today: {formatHijri(today, hijriOffset)}</div>
        </div>
      </Card>

      <LocationCard />

      <Card title="Reminders">
        <div className="small muted">Shown inside the app while it is open.</div>
        <div>
          {sw('azanAlert', 'Azan alert', 'At each prayer time, by your location')}
          {sw('jamaatNudge', 'Jamaat nudge', '15 minutes before the next prayer')}
          {sw('azkarReminder', 'Azkar reminder', 'After Fajr and after Asr')}
          {sw('smartFix', 'Smart fix suggestions', 'In the weekly report after 3 missed Fajr')}
        </div>
      </Card>

      <Card title="Privacy">
        <div>
          <div className="list-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <span className="grow">
              <span className="strong">Public username</span>
              <br />
              <span className="small muted">
                {user.username ? `@${user.username}` : 'Not set'}
              </span>
            </span>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => setUsernameDialogOpen(true)}
            >
              {user.username ? 'Edit' : 'Set username'}
            </button>
          </div>

          <Switch
            label="Show me on the global leaderboard"
            hint="Others see only your username, points and streak"
            checked={Boolean(s.showOnGlobal)}
            disabled={busy.has('showOnGlobal')}
            onChange={handleGlobalSwitch}
          />

          {sw('shareStats', 'Friends see my points and streak', 'Needed for the leaderboard')}
          {sw('shareHeatmap', 'Friends see my Namaz heatmap', 'Off by default, so ibadat stays between you and Allah')}
          {sw('shareQuran', 'Friends see my Quran streak', 'Off by default. Nafl is always private.')}
          {sw('weeklyReport', 'Weekly report', 'Only for you, never for friends')}
          {sw('showHadith', 'Show hadith cards', 'One short hadith on some screens')}
        </div>
      </Card>

      {blockedList.length > 0 && (
        <Card title="Blocked users">
          <div className="stack stack--sm">
            {blockedList.map((bu) => (
              <div key={bu.id} className="list-row">
                <span className="grow strong">@{bu.username}</span>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  disabled={unblocking === bu.id}
                  onClick={() => handleUnblock(bu)}
                >
                  {unblocking === bu.id ? 'Unblocking…' : 'Unblock'}
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <AccountCard />

      {usernameDialogOpen && (
        <UsernameDialog
          onClose={() => setUsernameDialogOpen(false)}
          currentUsername={user?.username}
          onSaved={async () => {
            // If they didn't have showOnGlobal set, prompt/keep it clean
          }}
        />
      )}
    </>
  );
}
