import { supabase } from '../lib/supabase.js';

let onAuthExpired = () => {};

/** AuthContext registers the handler that clears state and goes to /login. */
export function setAuthExpiredHandler(fn) {
  onAuthExpired = typeof fn === 'function' ? fn : () => {};
}

export function db() {
  if (!supabase) throw new Error('The app is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  return supabase;
}

const AUTH_CODES = new Set(['PGRST301', 'PGRST302', '28000', '42501_jwt']);

export function isAuthError(error, status) {
  if (!error) return false;
  if (status === 401) return true;
  if (AUTH_CODES.has(error.code)) return true;
  const msg = String(error.message || '').toLowerCase();
  return msg.includes('jwt expired') || msg.includes('invalid jwt') || msg === 'not signed in';
}

function friendlyMessage(error) {
  const msg = error?.message || 'Something went wrong';
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return 'You seem to be offline. Check your connection and try again.';
  }
  return msg;
}

/** Turn a supabase-js { data, error, status } result into data or a thrown Error. */
export function unwrap(result) {
  const { data, error, status } = result;
  if (error) {
    if (isAuthError(error, status)) {
      onAuthExpired();
      const e = new Error('Your session has ended. Please sign in again.');
      e.auth = true;
      throw e;
    }
    throw new Error(friendlyMessage(error));
  }
  return data;
}

export async function rpc(fn, args) {
  let result;
  try {
    result = await db().rpc(fn, args);
  } catch (err) {
    throw new Error(friendlyMessage(err));
  }
  return unwrap(result);
}

export async function select(query) {
  let result;
  try {
    result = await query;
  } catch (err) {
    throw new Error(friendlyMessage(err));
  }
  return unwrap(result);
}
