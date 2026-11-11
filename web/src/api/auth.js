import { db, rpc } from './client.js';

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

function authError(error) {
  const msg = error?.message || 'Something went wrong';
  if (/invalid login credentials/i.test(msg)) return new Error('Email or password is incorrect.');
  if (/email not confirmed/i.test(msg)) return new Error('Please confirm your email first. Check your inbox.');
  if (/rate limit/i.test(msg)) return new Error('Too many attempts. Please wait a minute and try again.');
  if (/failed to fetch/i.test(msg)) return new Error('You seem to be offline. Check your connection and try again.');
  return new Error(msg);
}

/** { id, name, email, settings } (+ timezone) or throws if signed out. */
export async function me() {
  const { data } = await db().auth.getSession();
  if (!data?.session) throw new Error('Not signed in');
  return rpc('get_me');
}

export async function login(email, password) {
  const { error } = await db().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw authError(error);
  return me();
}

/**
 * Returns the user shape. If email confirmation is switched on in Supabase,
 * there is no session yet: returns { needsConfirmation: true, email }.
 */
export async function signup(name, email, password) {
  const { data, error } = await db().auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { name: name.trim(), timezone: browserTimeZone() },
      emailRedirectTo: `${window.location.origin}/`,
    },
  });
  if (error) throw authError(error);
  if (!data.session) return { needsConfirmation: true, email: email.trim() };
  return me();
}

export async function logout() {
  const { error } = await db().auth.signOut();
  if (error) {
    // still clear the local session so the user is never stuck signed in
    await db().auth.signOut({ scope: 'local' });
  }
}

export async function requestPasswordReset(email) {
  const { error } = await db().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  // Same answer whether or not the account exists (no enumeration), but do
  // surface rate limits and network failures.
  if (error && /rate limit|failed to fetch/i.test(error.message)) throw authError(error);
}

export async function updatePassword(password) {
  const { error } = await db().auth.updateUser({ password });
  if (error) throw authError(error);
}
