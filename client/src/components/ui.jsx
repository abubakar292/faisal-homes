import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import { STATUS } from '../lib/format.js';

export function Spinner({ className = 'h-5 w-5' }) { return <Loader2 className={`animate-spin text-navy-600 ${className}`} />; }
export function Loading({ text = 'Loading…' }) {
  return <div className="flex items-center justify-center gap-3 py-16 text-slate-500"><Spinner /> {text}</div>;
}
export function ErrorBox({ error, className = '' }) {
  if (!error) return null;
  return (
    <div className={`flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 ${className}`} role="alert">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error.message || String(error)}</span>
    </div>
  );
}
export function Notice({ children, tone = 'info', className = '' }) {
  const tones = { info: 'border-blue-200 bg-blue-50 text-blue-900', warn: 'border-amber-200 bg-amber-50 text-amber-900', ok: 'border-emerald-200 bg-emerald-50 text-emerald-900' };
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : Info;
  return <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${tones[tone]} ${className}`}><Icon className="mt-0.5 h-4 w-4 shrink-0" /><div>{children}</div></div>;
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && <Link to={back.to} className="mb-1 inline-block text-sm text-navy-600 hover:underline">← {back.label}</Link>}
        <h1 className="truncate text-2xl font-bold tracking-tight text-navy-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '', bodyClass = 'p-4 sm:p-5' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold text-navy-900">{title}</h2>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function StatusBadge({ status, label }) {
  const s = STATUS[status] || { label: status, cls: 'bg-slate-100 text-slate-700 ring-slate-500/20' };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${s.cls}`}>{label || s.label}</span>;
}

export function StatCard({ label, value, sub, icon: Icon, tone = 'navy', to }) {
  const tones = { navy: 'bg-navy-50 text-navy-700', gold: 'bg-gold-50 text-gold-600', green: 'bg-emerald-50 text-emerald-700', red: 'bg-red-50 text-red-700', blue: 'bg-blue-50 text-blue-700', violet: 'bg-violet-50 text-violet-700', slate: 'bg-slate-100 text-slate-600' };
  const body = (
    <div className="card flex h-full items-start gap-3 p-3 transition hover:shadow-md sm:p-4">
      {Icon && <div className={`hidden rounded-lg p-2.5 sm:block ${tones[tone]}`}><Icon className="h-5 w-5" /></div>}
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:text-xs">{label}</div>
        <div className={`mt-0.5 break-words font-bold leading-tight text-slate-900 tabular-nums ${String(value).length > 15 ? 'text-base sm:text-lg' : 'text-lg sm:text-xl'}`} title={typeof value === 'string' ? value : undefined}>{value}</div>
        {sub && <div className="mt-0.5 truncate text-xs text-slate-500">{sub}</div>}
      </div>
    </div>
  );
  return to ? <Link to={to} className="block">{body}</Link> : body;
}

export function Field({ label, hint, error, required, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label">{label}{required && <span className="text-red-600"> *</span>}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}
export function Input({ label, hint, error, required, className, ...p }) {
  return <Field label={label} hint={hint} error={error} required={required} className={className}><input className="input" required={required} {...p} value={p.value ?? ''} /></Field>;
}
export function Select({ label, hint, error, required, options, placeholder, className, ...p }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      <select className="input" required={required} {...p} value={p.value ?? ''}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </Field>
  );
}
export function Textarea({ label, hint, error, required, className, rows = 3, ...p }) {
  return <Field label={label} hint={hint} error={error} required={required} className={className}><textarea className="input" rows={rows} required={required} {...p} value={p.value ?? ''} /></Field>;
}
export function Checkbox({ label, checked, onChange, hint }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 py-1">
      <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-navy-700 focus:ring-navy-500" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm text-slate-700">{label}{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span>
    </label>
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`flex max-h-[95vh] w-full ${w} flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl`} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h3 className="text-lg font-semibold text-navy-900">{title}</h3>
          <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>, document.body);
}

/** Confirmation dialog that can require a reason (used for every cancel / reverse action). */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmText = 'Confirm', danger, requireReason, reasonLabel = 'Reason', children }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { if (open) { setReason(''); setErr(null); } }, [open]);
  const go = async () => {
    if (requireReason && !reason.trim()) { setErr(new Error(`${reasonLabel} is required`)); return; }
    setBusy(true); setErr(null);
    try { await onConfirm(reason.trim()); onClose(); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Back</button>
        <button type="button" className={danger ? 'btn-danger' : 'btn-primary'} onClick={go} disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />}{confirmText}</button></>}>
      {message && <p className="mb-3 text-sm text-slate-600">{message}</p>}
      {children}
      {requireReason && <Textarea label={reasonLabel} required value={reason} onChange={(e) => setReason(e.target.value)} />}
      <ErrorBox error={err} className="mt-3" />
    </Modal>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map(([k, label, count]) => (
        <button key={k} type="button" onClick={() => onChange(k)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${active === k ? 'border-gold-400 text-navy-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          {label}{count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{count}</span>}
        </button>
      ))}
    </div>
  );
}

export function KV({ items, cols = 2 }) {
  return (
    <dl className={`grid gap-x-6 gap-y-2.5 ${cols === 3 ? 'sm:grid-cols-3' : cols === 1 ? '' : 'sm:grid-cols-2'}`}>
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt>
          <dd className="mt-0.5 break-words text-sm font-medium text-slate-900">{v === null || v === undefined || v === '' ? '—' : v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ------------------------------------------------------------------ toasts
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = 'ok') => {
    const id = Math.random();
    setItems((x) => [...x, { id, message, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto flex items-start gap-2 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${t.tone === 'error' ? 'bg-red-600' : 'bg-navy-900'}`}>
            {t.tone === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 text-gold-400" />}<span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Empty({ text = 'Nothing here yet.', action }) {
  return <div className="py-10 text-center text-sm text-slate-500"><p>{text}</p>{action && <div className="mt-3">{action}</div>}</div>;
}
