import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const Ctx = createContext({ name: 'FAISAL HOMES', tagline: '', hasLogo: false, v: 0, reload: () => {} });
export function BrandingProvider({ children }) {
  const [b, setB] = useState({ name: 'FAISAL HOMES', tagline: '', hasLogo: false, v: 0 });
  const reload = useCallback(async () => {
    // v = the logo's version, so browsers show a new logo as soon as it is changed.
    try { const d = await api.get('/public/branding'); setB((x) => ({ ...d, v: d.logoVersion ?? x.v + 1 })); } catch { /* offline */ }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { document.title = b.name || 'FAISAL HOMES'; }, [b.name]);
  return <Ctx.Provider value={{ ...b, reload }}>{children}</Ctx.Provider>;
}
export const useBranding = () => useContext(Ctx);
