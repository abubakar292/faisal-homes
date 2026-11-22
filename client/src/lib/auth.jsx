import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, setTokenProvider, setUnauthorizedHandler } from './api.js';
import { getSupabase, syncTokenCookie } from './supabase.js';
import { configureFormat } from './format.js';
import { setLanguage } from '../i18n/index.js';

const AuthCtx = createContext(null);
const SIGNED_OUT = { loading: false, user: null, permissions: [], settings: {} };

/** Login is Supabase Auth (email + password). The server adds the role, permissions and settings. */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, permissions: [], settings: {} });
  const [notice, setNotice] = useState('');
  const [configError, setConfigError] = useState(null);
  const lastActivity = useRef(Date.now());
  const sbRef = useRef(null);

  const apply = useCallback((d) => {
    configureFormat(d.settings || {});
    setLanguage(d.settings?.display?.language || 'en');
    setState({ loading: false, user: d.user, permissions: d.permissions || [], settings: d.settings || {} });
  }, []);

  const signOutLocal = useCallback(async () => {
    syncTokenCookie(null);
    try { await sbRef.current?.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
  }, []);

  const loadMe = useCallback(async () => {
    try { apply(await api.get('/auth/me')); } catch (e) {
      if (e.code === 'SESSION_EXPIRED') setNotice('Your session expired. Please log in again.');
      else if (e.status === 403) setNotice(e.message);
      else if (e.status && e.status !== 401) setNotice(e.message);
      if (e.status === 401 || e.status === 403) await signOutLocal();
      setState(SIGNED_OUT);
    }
  }, [apply, signOutLocal]);

  useEffect(() => {
    let subscription = null;
    (async () => {
      try {
        const sb = await getSupabase();
        sbRef.current = sb;
        setTokenProvider(async () => {
          const { data } = await sb.auth.getSession(); // refreshes the token when it is about to expire
          syncTokenCookie(data.session);
          return data.session?.access_token || null;
        });
        subscription = sb.auth.onAuthStateChange((event, session) => {
          syncTokenCookie(session);
          if (event === 'SIGNED_OUT') setState(SIGNED_OUT);
        }).data.subscription;
        const { data } = await sb.auth.getSession();
        syncTokenCookie(data.session);
        if (data.session) await loadMe(); else setState(SIGNED_OUT);
      } catch (e) {
        setConfigError(e);
        setState(SIGNED_OUT);
      }
    })();
    return () => subscription?.unsubscribe();
  }, [loadMe]);

  useEffect(() => {
    setUnauthorizedHandler((d) => {
      setNotice(d?.code === 'SESSION_EXPIRED' ? 'Your session expired. Please log in again.' : 'Please log in.');
      signOutLocal();
      setState((s) => ({ ...s, user: null }));
    });
  }, [signOutLocal]);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    await signOutLocal();
    setState(SIGNED_OUT);
  }, [signOutLocal]);

  // Client-side idle logout after the time set in Settings → Security.
  useEffect(() => {
    if (!state.user) return undefined;
    const bump = () => { lastActivity.current = Date.now(); };
    const evs = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const mins = state.settings.session_timeout_minutes || 30;
    const timer = setInterval(async () => {
      if (Date.now() - lastActivity.current > mins * 60 * 1000) {
        await logout();
        setNotice(`You were logged out after ${mins} minutes of inactivity.`);
      }
    }, 15000);
    return () => { evs.forEach((e) => window.removeEventListener(e, bump)); clearInterval(timer); };
  }, [state.user, state.settings.session_timeout_minutes, logout]);

  const login = async (email, password) => {
    const sb = sbRef.current || (await getSupabase());
    sbRef.current = sb;
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(/invalid login credentials/i.test(error.message) ? 'Incorrect email or password' : error.message);
    syncTokenCookie(data.session);
    setNotice('');
    lastActivity.current = Date.now();
    try { await api.post('/auth/login-event'); } catch { /* the profile check below explains any problem */ }
    await loadMe();
  };
  const setup = async (body) => { await api.post('/auth/setup', body); await login(body.email, body.password); };
  const changePassword = async (body) => { apply(await api.post('/auth/change-password', body)); };
  const can = useCallback((p) => state.permissions.includes(p), [state.permissions]);

  return (
    <AuthCtx.Provider value={{ ...state, notice, configError, login, setup, logout, changePassword, can, refresh: loadMe }}>
      {children}
    </AuthCtx.Provider>
  );
}
export const useAuth = () => useContext(AuthCtx);
