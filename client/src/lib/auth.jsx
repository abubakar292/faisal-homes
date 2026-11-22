import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, setUnauthorizedHandler } from './api.js';
import { configureFormat } from './format.js';
import { setLanguage } from '../i18n/index.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, permissions: [], settings: {} });
  const [notice, setNotice] = useState('');
  const lastActivity = useRef(Date.now());

  const apply = useCallback((d) => {
    configureFormat(d.settings || {});
    setLanguage(d.settings?.display?.language || 'en');
    setState({ loading: false, user: d.user, permissions: d.permissions || [], settings: d.settings || {} });
  }, []);

  const refresh = useCallback(async () => {
    try { apply(await api.get('/auth/me')); } catch (e) {
      if (e.code === 'SESSION_EXPIRED') setNotice('Your session expired. Please log in again.');
      setState({ loading: false, user: null, permissions: [], settings: {} });
    }
  }, [apply]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    setUnauthorizedHandler((d) => {
      setNotice(d?.code === 'SESSION_EXPIRED' ? 'Your session expired. Please log in again.' : 'Please log in.');
      setState((s) => ({ ...s, user: null }));
    });
  }, []);

  // Client-side idle logout (the server also expires idle sessions).
  useEffect(() => {
    if (!state.user) return undefined;
    const bump = () => { lastActivity.current = Date.now(); };
    const evs = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const mins = state.settings.session_timeout_minutes || 30;
    const timer = setInterval(async () => {
      if (Date.now() - lastActivity.current > mins * 60 * 1000) {
        try { await api.post('/auth/logout'); } catch { /* ignore */ }
        setNotice(`You were logged out after ${mins} minutes of inactivity.`);
        setState((s) => ({ ...s, user: null }));
      }
    }, 15000);
    return () => { evs.forEach((e) => window.removeEventListener(e, bump)); clearInterval(timer); };
  }, [state.user, state.settings.session_timeout_minutes]);

  const login = async (username, password) => { const d = await api.post('/auth/login', { username, password }); setNotice(''); lastActivity.current = Date.now(); apply(d); };
  const setup = async (body) => { apply(await api.post('/auth/setup', body)); };
  const logout = async () => { try { await api.post('/auth/logout'); } finally { setState((s) => ({ ...s, user: null })); } };
  const changePassword = async (body) => { apply(await api.post('/auth/change-password', body)); };
  const can = useCallback((p) => state.permissions.includes(p), [state.permissions]);

  return (
    <AuthCtx.Provider value={{ ...state, notice, login, setup, logout, changePassword, can, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}
export const useAuth = () => useContext(AuthCtx);
