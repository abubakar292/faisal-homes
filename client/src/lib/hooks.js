import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';

export function useApi(url, options = {}) {
  return useQuery({ queryKey: [url], queryFn: () => api.get(url), enabled: !!url && (options.enabled ?? true), ...options });
}
/** After any change, refresh every cached list so all screens show the new numbers. */
export function useRefreshAll() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries(), [qc]);
}
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const set = useCallback((key) => (e) => {
    const v = e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
    setValues((s) => ({ ...s, [key]: v }));
  }, []);
  return [values, set, setValues];
}
export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
