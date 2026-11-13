import { useState, useId } from 'react';
import { profile } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Dialog } from './index.jsx';

export const USERNAME_REGEX = /^[a-z][a-z0-9_]{2,19}$/;

export function generateSuggestedUsername(name) {
  const cleanName = (name || 'user')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .slice(0, 10) || 'user';
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${cleanName}${rand}`;
}

export function UsernameDialog({ onClose, onSaved, currentUsername }) {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [val, setVal] = useState(() => currentUsername || generateSuggestedUsername(user?.name));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const inputId = useId();

  const trimmed = val.toLowerCase().trim();
  let validationError = null;
  if (!trimmed) {
    validationError = 'Username is required.';
  } else if (trimmed.length < 3) {
    validationError = 'Username must be at least 3 characters.';
  } else if (trimmed.length > 20) {
    validationError = 'Username must be at most 20 characters.';
  } else if (!/^[a-z]/.test(trimmed)) {
    validationError = 'Must start with a lowercase letter.';
  } else if (!USERNAME_REGEX.test(trimmed)) {
    validationError = 'Can only contain lowercase letters, numbers, and underscores.';
  }

  const submit = async (e) => {
    e.preventDefault();
    if (validationError || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const updated = await profile.setUsername(trimmed);
      if (setUser) setUser(updated);
      toast.show('Username saved');
      if (onSaved) await onSaved(trimmed, updated);
      onClose();
    } catch (e2) {
      setErr(e2.message || 'Could not save username');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={currentUsername ? 'Edit username' : 'Choose a username'} onClose={onClose}>
      <form onSubmit={submit} className="stack" noValidate>
        <p className="small muted">
          Usernames are 3–20 characters, start with a letter, and contain only lowercase letters, numbers, and underscores.
        </p>
        <div className="field">
          <label className="field__label" htmlFor={inputId}>Public username</label>
          <input
            id={inputId}
            className="input"
            type="text"
            value={val}
            onChange={(e) => { setVal(e.target.value.toLowerCase().replace(/\s+/g, '')); setErr(null); }}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
          />
        </div>
        {(validationError || err) && (
          <div className="field__error" role="alert">{validationError || err}</div>
        )}
        <button
          type="submit"
          className="btn btn--primary"
          disabled={busy || Boolean(validationError)}
        >
          {busy ? 'Saving…' : 'Save username'}
        </button>
      </form>
    </Dialog>
  );
}

