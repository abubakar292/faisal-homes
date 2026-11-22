import { useEffect, useRef, useState } from 'react';
import { Upload, Trash2, Plus, Save } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi, useRefreshAll } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { useBranding } from '../components/Branding.jsx';
import { pkr } from '../lib/format.js';
import { Card, Checkbox, ErrorBox, Input, Loading, Modal, Notice, PageHeader, Select, Textarea, useToast } from '../components/ui.jsx';

function Section({ title, desc, children, onSave }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async () => { setBusy(true); setErr(null); try { await onSave(); } catch (e) { setErr(e); } finally { setBusy(false); } };
  return (
    <Card title={title} actions={onSave && <button type="button" className="btn-primary btn-sm" onClick={save} disabled={busy}><Save className="h-4 w-4" />Save</button>}>
      {desc && <p className="-mt-1 mb-3 text-sm text-slate-500">{desc}</p>}
      {children}
      <ErrorBox error={err} className="mt-3" />
    </Card>
  );
}

export default function SettingsPage() {
  const { refresh: refreshMe } = useAuth();
  const branding = useBranding();
  const toast = useToast(); const refresh = useRefreshAll();
  const { data, isLoading } = useApi('/settings');
  const { data: cats } = useApi('/settings/expense-categories');
  const [s, setS] = useState(null);
  const [cat, setCat] = useState(null);
  const [catErr, setCatErr] = useState(null);
  const logoRef = useRef();
  useEffect(() => { if (data) setS(JSON.parse(JSON.stringify(data))); }, [data]);
  if (isLoading || !s) return <Loading />;
  const set = (sec, k) => (e) => setS({ ...s, [sec]: { ...s[sec], [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e } });
  const save = (sec) => async () => { await api.put('/settings', { [sec]: s[sec] }); toast('Settings saved'); refresh(); await refreshMe(); if (sec === 'company') branding.reload(); };
  const uploadLogo = async () => {
    const file = logoRef.current?.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try { await api.upload('/settings/logo', fd); toast('Logo uploaded'); branding.reload(); } catch (e) { toast(e.message, 'error'); }
  };
  const saveCat = async (e) => {
    e.preventDefault(); setCatErr(null);
    try { if (cat.id) await api.put(`/settings/expense-categories/${cat.id}`, cat); else await api.post('/settings/expense-categories', cat); toast('Category saved'); refresh(); setCat(null); } catch (ex) { setCatErr(ex); }
  };
  const lf = s.late_fee;
  return (
    <>
      <PageHeader title="Settings" subtitle="Company details, measurements, security, late fees, backups and receipts" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Company" desc="Shown on receipts, letters, reports and the login screen." onSave={save('company')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Company name" value={s.company.name} onChange={set('company', 'name')} />
            <Input label="Tagline" value={s.company.tagline} onChange={set('company', 'tagline')} />
            <Input label="Address" className="sm:col-span-2" value={s.company.address} onChange={set('company', 'address')} />
            <Input label="Phone" value={s.company.phone} onChange={set('company', 'phone')} />
            <Input label="Email" value={s.company.email} onChange={set('company', 'email')} />
            <Input label="Website" value={s.company.website} onChange={set('company', 'website')} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-slate-300 p-3">
            {branding.hasLogo ? <img src={`/api/public/logo?v=${branding.v}`} alt="Logo" className="h-14 w-14 rounded border object-contain" /> : <div className="flex h-14 w-14 items-center justify-center rounded border bg-slate-50 text-xs text-slate-400">No logo</div>}
            <input ref={logoRef} type="file" accept="image/png,image/jpeg" className="text-sm" />
            <button type="button" className="btn-secondary btn-sm" onClick={uploadLogo}><Upload className="h-4 w-4" />Upload logo</button>
            {branding.hasLogo && <button type="button" className="btn-ghost btn-sm text-red-600" onClick={async () => { await api.del('/settings/logo'); branding.reload(); }}><Trash2 className="h-4 w-4" /></button>}
            <span className="w-full text-xs text-slate-500">PNG or JPG, max 2 MB. Square logos look best.</span>
          </div>
        </Section>
        <Section title="Land measurement" desc="Local Marla size differs by area. New land and societies use this default; each land/society can have its own value." onSave={save('measurement')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="1 Marla = square feet" inputMode="decimal" value={s.measurement.marla_sqft} onChange={set('measurement', 'marla_sqft')} hint="Common: 272.25 (revenue), 225 or 250 (some societies)" />
            <Input label="1 Kanal = Marla" inputMode="decimal" value={s.measurement.kanal_marla} onChange={set('measurement', 'kanal_marla')} />
          </div>
        </Section>
        <Section title="Display & language" onSave={save('display')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Number format" value={s.display.number_format} onChange={set('display', 'number_format')} options={[['intl', 'Rs 1,234,567 (million)'], ['lakh', 'Rs 12,34,567 (lakh / crore)']]} />
            <Select label="Language" value={s.display.language} onChange={set('display', 'language')} options={[['en', 'English'], ['ur', 'اردو (partial — in progress)']]} />
          </div>
        </Section>
        <Section title="Security" onSave={save('security')}>
          <Input label="Log out after inactivity (minutes)" inputMode="numeric" value={s.security.session_timeout_minutes} onChange={set('security', 'session_timeout_minutes')} hint="Between 5 and 1440 minutes" />
        </Section>
        <Section title="Installments" onSave={save('installments')}>
          <Select label="Default rounding for new plans" value={String(s.installments.default_rounding)} onChange={set('installments', 'default_rounding')} options={[['1', 'Rs 1'], ['100', 'Rs 100'], ['500', 'Rs 500'], ['1000', 'Rs 1,000'], ['5000', 'Rs 5,000']]} />
        </Section>
        <Section title="Late fee" desc="Off by default. Even when enabled, a late fee is only charged when an admin posts it on a booking — never automatically." onSave={save('late_fee')}>
          <Checkbox label="Enable late fee suggestions" checked={lf.enabled} onChange={set('late_fee', 'enabled')} />
          {lf.enabled && (
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <Select label="Type" value={lf.mode} onChange={set('late_fee', 'mode')} options={[['FIXED', 'Fixed amount per installment'], ['PERCENT', '% of unpaid installment']]} />
              <Input label={lf.mode === 'PERCENT' ? 'Percent (%)' : 'Amount (Rs)'} inputMode="decimal" value={lf.value} onChange={set('late_fee', 'value')} />
              <Input label="Grace days" inputMode="numeric" value={lf.grace_days} onChange={set('late_fee', 'grace_days')} />
            </div>
          )}
        </Section>
        <Section title="Automatic backup" desc="A full backup (database + documents) is made every day at this time. If the computer was off, a catch-up backup is made when FAISAL HOMES starts." onSave={save('backup')}>
          <Checkbox label="Automatic daily backup" checked={s.backup.auto_enabled} onChange={set('backup', 'auto_enabled')} />
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Input label="Backup time (24-hour)" type="time" value={s.backup.time} onChange={set('backup', 'time')} />
            <Input label="Automatic backups to keep" inputMode="numeric" value={s.backup.retention_count} onChange={set('backup', 'retention_count')} />
          </div>
          <Notice className="mt-3">Backup folder: <code className="text-xs">{s._paths.backupDir}</code>{s._paths.backupCopyDir ? <> · copy to <code className="text-xs">{s._paths.backupCopyDir}</code></> : <> · Tip: set BACKUP_COPY_DIR in the .env file to a Google Drive / USB folder for an off-site copy.</>}</Notice>
        </Section>
        <Section title="Receipts & letters" onSave={save('receipt')}>
          <div className="space-y-3">
            <Input label="Signature label" value={s.receipt.signature_label} onChange={set('receipt', 'signature_label')} />
            <Textarea label="Receipt footer note" rows={2} value={s.receipt.footer_note} onChange={set('receipt', 'footer_note')} />
            <Textarea label="Booking terms & conditions (printed on booking confirmation)" rows={5} value={s.receipt.booking_terms} onChange={set('receipt', 'booking_terms')} />
          </div>
        </Section>
        <Card title="Expense categories" className="lg:col-span-2" actions={<button type="button" className="btn-primary btn-sm" onClick={() => { setCat({ name: '', cost_type: 'OPERATING', is_active: true }); setCatErr(null); }}><Plus className="h-4 w-4" />Add category</button>}>
          <p className="-mt-1 mb-3 text-sm text-slate-500">Cost type controls profit: <b>Land payment</b> = paid to land seller · <b>Project cost</b> = development cost spread over plots (cost per Marla) · <b>Operating</b> = office/marketing costs deducted from profit.</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(cats || []).map((c) => (
              <button type="button" key={c.id} onClick={() => { setCat(c); setCatErr(null); }} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-slate-50 ${c.is_active ? '' : 'opacity-50'}`}>
                <span className="font-medium">{c.name}</span><span className="text-xs text-slate-500">{{ LAND_PAYMENT: 'Land payment', PROJECT: 'Project cost', OPERATING: 'Operating' }[c.cost_type]}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
      <Modal open={!!cat} onClose={() => setCat(null)} title={cat?.id ? 'Edit category' : 'New category'} size="sm" footer={<><button type="button" className="btn-secondary" onClick={() => setCat(null)}>Cancel</button><button form="cat" className="btn-primary">Save</button></>}>
        {cat && <form id="cat" onSubmit={saveCat} className="space-y-3">
          <Input label="Name" required value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value })} />
          <Select label="Cost type" value={cat.cost_type} onChange={(e) => setCat({ ...cat, cost_type: e.target.value })} options={[['LAND_PAYMENT', 'Land payment'], ['PROJECT', 'Project cost'], ['OPERATING', 'Operating expense']]} />
          <Checkbox label="Active" checked={cat.is_active} onChange={(v) => setCat({ ...cat, is_active: v })} />
          <ErrorBox error={catErr} />
        </form>}
      </Modal>
      <p className="mt-6 text-xs text-slate-400">Amounts are shown like {pkr(1234567)}.</p>
    </>
  );
}
