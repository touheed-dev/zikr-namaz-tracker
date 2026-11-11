import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { auth } from '../api/index.js';
import { isConfigured } from '../lib/supabase.js';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function Brand({ title, sub }) {
  return (
    <header className="stack stack--sm" style={{ marginBottom: 8 }}>
      <div className="eyebrow eyebrow--light">Zikr &amp; Namaz</div>
      <h1>{title}</h1>
      {sub && <p className="muted">{sub}</p>}
    </header>
  );
}

function Field({ id, label, error, ...props }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <input id={id} className="input" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-err` : undefined} {...props} />
      {error && <div className="field__error" id={`${id}-err`}>{error}</div>}
    </div>
  );
}

function ConfigWarning() {
  if (isConfigured) return null;
  return (
    <div className="notice notice--error" role="alert">
      This build has no Supabase settings. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY and rebuild.
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const expired = location.state?.expired;

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const errs = {};
    if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter a valid email address.';
    if (!password) errs.password = 'Enter your password.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await login(email, password);
      const from = location.state?.from;
      const to = from && from.pathname && !['/login', '/signup'].includes(from.pathname)
        ? `${from.pathname}${from.search || ''}` : '/';
      navigate(to, { replace: true });
    } catch (err) {
      setErrors({ form: err.message });
      setBusy(false);
    }
  };

  return (
    <>
      <Brand title="Welcome back" sub="Assalamu Alaikum. Sign in to continue." />
      <ConfigWarning />
      {expired && <div className="notice" role="status">Your session ended. Please sign in again.</div>}
      <form className="stack" onSubmit={submit} noValidate>
        <Field id="email" label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <Field id="password" label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        {errors.form && <div className="notice notice--error" role="alert">{errors.form}</div>}
        <button type="submit" className="btn btn--primary btn--block" disabled={busy || !isConfigured}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <div className="row row--between small">
        <Link to="/forgot-password">Forgot password?</Link>
        <Link to="/signup" state={location.state}>Create an account</Link>
      </div>
    </>
  );
}

export function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const errs = {};
    if (!name.trim()) errs.name = 'Enter your name.';
    else if (name.trim().length > 60) errs.name = 'Use 60 characters or fewer.';
    if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter a valid email address.';
    if (password.length < 8) errs.password = 'Use at least 8 characters.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const res = await signup(name, email, password);
      if (res?.needsConfirmation) {
        setSentTo(res.email);
        setBusy(false);
        return;
      }
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setErrors({ form: err.message });
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <>
        <Brand title="Check your email" sub={`We sent a confirmation link to ${sentTo}. Open it on this device to finish signing up.`} />
        <Link to="/login" className="btn btn--primary btn--block">Back to sign in</Link>
      </>
    );
  }

  return (
    <>
      <Brand title="Create your account" sub="Private by default. Friends see only your name, points and streak." />
      <ConfigWarning />
      <form className="stack" onSubmit={submit} noValidate>
        <Field id="name" label="Name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={60} />
        <Field id="email" label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <Field id="password" label="Password (8+ characters)" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        {errors.form && <div className="notice notice--error" role="alert">{errors.form}</div>}
        <button type="submit" className="btn btn--primary btn--block" disabled={busy || !isConfigured}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <div className="small center">Already have an account? <Link to="/login" state={location.state}>Sign in</Link></div>
    </>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!EMAIL_RE.test(email.trim())) { setError('Enter a valid email address.'); return; }
    setError(null);
    setBusy(true);
    try {
      await auth.requestPasswordReset(email);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Brand title="Reset your password" sub="Enter your email and we will send you a link." />
      {done ? (
        <div className="notice notice--ok" role="status">If an account exists for that email, a reset link is on its way. Check your inbox and spam folder.</div>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          <Field id="email" label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
          <button type="submit" className="btn btn--primary btn--block" disabled={busy || !isConfigured}>{busy ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
      <div className="small center"><Link to="/login">Back to sign in</Link></div>
    </>
  );
}

export function ResetPassword() {
  const { status, reload } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const errs = {};
    if (password.length < 8) errs.password = 'Use at least 8 characters.';
    if (confirm !== password) errs.confirm = 'Passwords do not match.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await auth.updatePassword(password);
      await reload();
      navigate('/', { replace: true });
    } catch (err) {
      setErrors({ form: err.message });
      setBusy(false);
    }
  };

  if (status === 'loading') return <div className="skeleton" style={{ height: 240 }} aria-hidden="true" />;
  if (status !== 'signedIn') {
    return (
      <>
        <Brand title="Link expired" sub="This reset link is invalid or has expired. Request a new one." />
        <Link to="/forgot-password" className="btn btn--primary btn--block">Request a new link</Link>
      </>
    );
  }

  return (
    <>
      <Brand title="Choose a new password" />
      <form className="stack" onSubmit={submit} noValidate>
        <Field id="password" label="New password (8+ characters)" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <Field id="confirm" label="Repeat new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
        {errors.form && <div className="notice notice--error" role="alert">{errors.form}</div>}
        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </>
  );
}

export function NotFound() {
  return (
    <div className="card state">
      <h1>Page not found</h1>
      <p className="muted">That page does not exist.</p>
      <Link to="/" className="btn btn--primary">Go to Today</Link>
    </div>
  );
}
