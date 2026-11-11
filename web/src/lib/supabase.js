import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

// Only the public anon key ever reaches the browser. Row Level Security and
// the SECURITY DEFINER functions decide what each signed-in user can do.
export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Implicit flow (default) so a reset / confirmation link works even
        // when it is opened on a different device than the one that asked.
        detectSessionInUrl: true,
      },
    })
  : null;
