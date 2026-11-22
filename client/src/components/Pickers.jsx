import { useState } from 'react';
import { Search, UserPlus, X } from 'lucide-react';
import { useApi, useDebounced } from '../lib/hooks.js';
import { qs } from '../lib/api.js';
import { pkr } from '../lib/format.js';
import { Spinner } from './ui.jsx';

export function CustomerPicker({ value, onChange, onCreateNew, label = 'Customer', exclude }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, isFetching } = useApi(dq.trim().length >= 2 ? `/customers${qs({ q: dq.trim(), limit: 20 })}` : null);
  if (value) {
    return (
      <div>
        <span className="label">{label}</span>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-navy-200 bg-navy-50 px-3 py-2">
          <div className="min-w-0">
            <div className="truncate font-semibold text-navy-900">{value.full_name}{value.father_name ? <span className="font-normal text-slate-500"> s/o {value.father_name}</span> : null}</div>
            <div className="truncate text-xs text-slate-600">{value.customer_code} · CNIC {value.cnic}{value.mobile ? ` · ${value.mobile}` : ''}</div>
          </div>
          <button type="button" className="btn-ghost btn-sm" onClick={() => onChange(null)}><X className="h-4 w-4" />Change</button>
        </div>
      </div>
    );
  }
  const list = (data || []).filter((c) => !exclude || c.id !== exclude);
  return (
    <div className="relative">
      <span className="label">{label}</span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Search by name, CNIC, mobile or customer ID…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        {isFetching && <Spinner className="absolute right-3 top-2.5 h-4 w-4" />}
      </div>
      {dq.trim().length >= 2 && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {list.map((c) => (
            <button type="button" key={c.id} className="block w-full border-b border-slate-50 px-3 py-2 text-left hover:bg-navy-50" onClick={() => { onChange(c); setQ(''); }}>
              <div className="font-medium text-slate-900">{c.full_name} <span className="text-xs text-slate-500">{c.customer_code}</span></div>
              <div className="text-xs text-slate-500">CNIC {c.cnic}{c.mobile ? ` · ${c.mobile}` : ''}{c.plot_count ? ` · ${c.plot_count} plot(s)` : ''}</div>
            </button>
          ))}
          {!list.length && !isFetching && <div className="px-3 py-3 text-sm text-slate-500">No customer found.</div>}
          {onCreateNew && (
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-navy-700 hover:bg-navy-50" onClick={() => onCreateNew(q)}>
              <UserPlus className="h-4 w-4" /> Register a new customer
            </button>
          )}
        </div>
      )}
      {onCreateNew && dq.trim().length < 2 && (
        <button type="button" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-navy-700 hover:underline" onClick={() => onCreateNew('')}>
          <UserPlus className="h-4 w-4" /> Register a new customer
        </button>
      )}
    </div>
  );
}

/** Search active bookings by customer, CNIC, mobile, plot or booking number. */
export function BookingPicker({ value, onChange, label = 'Customer / plot' }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, isFetching } = useApi(dq.trim().length >= 1 ? `/bookings${qs({ status: 'ACTIVE', q: dq.trim() })}` : null);
  if (value) {
    return (
      <div>
        <span className="label">{label}</span>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-navy-200 bg-navy-50 px-3 py-2">
          <div className="min-w-0">
            <div className="truncate font-semibold text-navy-900">{value.customer_name} — Plot {value.plot_no} (Block {value.block_name})</div>
            <div className="truncate text-xs text-slate-600">{value.booking_no} · {value.society_name} · Balance {pkr(value.balance)}</div>
          </div>
          <button type="button" className="btn-ghost btn-sm" onClick={() => onChange(null)}><X className="h-4 w-4" />Change</button>
        </div>
      </div>
    );
  }
  return (
    <div className="relative">
      <span className="label">{label}</span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Customer name, CNIC, mobile, plot no or booking no…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" autoFocus />
        {isFetching && <Spinner className="absolute right-3 top-2.5 h-4 w-4" />}
      </div>
      {dq.trim().length >= 1 && (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {(data || []).slice(0, 30).map((b) => (
            <button type="button" key={b.id} className="block w-full border-b border-slate-50 px-3 py-2 text-left hover:bg-navy-50" onClick={() => { onChange(b); setQ(''); }}>
              <div className="flex justify-between gap-2"><span className="font-medium text-slate-900">{b.customer_name}</span><span className="text-sm tabular-nums text-slate-700">{pkr(b.balance)}</span></div>
              <div className="text-xs text-slate-500">Plot {b.plot_no} · Block {b.block_name} · {b.booking_no} · CNIC {b.cnic}{Number(b.overdue_amount) > 0 ? ` · Overdue ${pkr(b.overdue_amount)}` : ''}</div>
            </button>
          ))}
          {!(data || []).length && !isFetching && <div className="px-3 py-3 text-sm text-slate-500">No active booking found.</div>}
        </div>
      )}
    </div>
  );
}
