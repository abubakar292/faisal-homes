// Supabase client for the browser: sign-in (Supabase Auth) and direct file uploads.
// The project URL and publishable key come from the server (/api/public/config), so they are only
// configured once, in the server's environment variables.
import { createClient } from '@supabase/supabase-js';

let clientPromise = null;

export function getSupabase() {
  if (!clientPromise) {
    clientPromise = fetch('/api/public/config')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Cannot reach the FAISAL HOMES server.'))))
      .then((cfg) => {
        if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('Supabase is not configured on the server (SUPABASE_URL / SUPABASE_ANON_KEY).');
        return createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'faisal-homes-auth' },
        });
      })
      .catch((e) => { clientPromise = null; throw e; });
  }
  return clientPromise;
}

/**
 * Plain browser links (PDF receipts, Excel exports, document images) cannot send the login header,
 * so the current access token is mirrored into a cookie that is only sent to /api on this site.
 */
export function syncTokenCookie(session) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  if (session?.access_token) {
    const maxAge = Math.max(60, Math.floor((session.expires_at || 0) - Date.now() / 1000));
    document.cookie = `fh_at=${session.access_token}; Path=/api; Max-Age=${maxAge}; SameSite=Strict${secure}`;
  } else {
    document.cookie = `fh_at=; Path=/api; Max-Age=0; SameSite=Strict${secure}`;
  }
}
