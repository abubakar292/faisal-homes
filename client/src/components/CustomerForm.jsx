import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useRefreshAll } from '../lib/hooks.js';
import { ErrorBox, Input, Textarea, useToast } from './ui.jsx';
import { todayStr } from '../lib/format.js';

const FIELDS = ['full_name', 'father_name', 'cnic', 'mobile', 'whatsapp', 'email', 'address', 'city', 'nominee_name', 'nominee_relation', 'nominee_cnic', 'nominee_mobile',
  'notes', 'registration_date'];

/** Format CNIC while typing: 35202-1234567-1 */
function cnicMask(v) {
  const d = v.replace(/\D/g, '').slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

export default function CustomerForm({ customer, initialName = '', onSaved, formId = 'customer-form', compact }) {
  const toast = useToast(); const refresh = useRefreshAll();
  const [f, setF] = useState({});
  const [err, setErr] = useState(null);
  const [sameWa, setSameWa] = useState(true);
  useEffect(() => {
    setF(customer ? Object.fromEntries(FIELDS.map((k) => [k, customer[k] ?? ''])) : { ...Object.fromEntries(FIELDS.map((k) => [k, ''])), full_name: initialName, registration_date: todayStr() });
    setSameWa(!customer || !customer.whatsapp || customer.whatsapp === customer.mobile);
  }, [customer, initialName]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: k.endsWith('cnic') ? cnicMask(e.target.value) : e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setErr(null);
    const body = { ...f, whatsapp: sameWa ? f.mobile : f.whatsapp };
    try {
      const saved = customer ? await api.put(`/customers/${customer.id}`, body) : await api.post('/customers', body);
      toast(customer ? 'Customer updated' : `Customer ${saved.customer_code} registered`); refresh(); onSaved?.(saved);
    } catch (ex) { setErr(ex); }
  };
  const err4 = (k) => (err?.field === k ? err.message : undefined);
  return (
    <form id={formId} onSubmit={submit} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Full name" required value={f.full_name} onChange={set('full_name')} error={err4('full_name')} autoFocus={!customer} />
        <Input label="Father's / husband's name" value={f.father_name} onChange={set('father_name')} />
        <Input label="CNIC number" required value={f.cnic} onChange={set('cnic')} placeholder="35202-1234567-1" inputMode="numeric" error={err4('cnic')} />
        <Input label="Mobile number" value={f.mobile} onChange={set('mobile')} placeholder="0300-1234567" inputMode="tel" error={err4('mobile')} />
        <div>
          <label className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={sameWa} onChange={(e) => setSameWa(e.target.checked)} className="h-4 w-4 rounded" /> WhatsApp same as mobile</label>
          {!sameWa && <input className="input" value={f.whatsapp || ''} onChange={set('whatsapp')} placeholder="WhatsApp number" inputMode="tel" />}
        </div>
        <Input label="Email" type="email" value={f.email} onChange={set('email')} error={err4('email')} />
        <Input label="Address" className="sm:col-span-2" value={f.address} onChange={set('address')} />
        <Input label="City" value={f.city} onChange={set('city')} />
        <Input label="Registration date" type="date" value={f.registration_date} onChange={set('registration_date')} />
      </div>
      <fieldset className="rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-sm font-semibold text-navy-900">Nominee</legend>
        <div className={`grid gap-3 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-4'}`}>
          <Input label="Name" value={f.nominee_name} onChange={set('nominee_name')} />
          <Input label="Relation" value={f.nominee_relation} onChange={set('nominee_relation')} placeholder="Son, wife…" />
          <Input label="CNIC" value={f.nominee_cnic} onChange={set('nominee_cnic')} inputMode="numeric" error={err4('nominee_cnic')} />
          <Input label="Mobile" value={f.nominee_mobile} onChange={set('nominee_mobile')} inputMode="tel" />
        </div>
      </fieldset>
      <Textarea label="Notes" value={f.notes} onChange={set('notes')} rows={2} />
      <ErrorBox error={err} />
    </form>
  );
}
