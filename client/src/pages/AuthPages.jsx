import { useEffect, useState } from 'react';
import { Building2, Lock } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { useBranding } from '../components/Branding.jsx';
import { ErrorBox, Input, Notice, Spinner, Card, PageHeader, useToast } from '../components/ui.jsx';

function Shell({ children }) {
  const b = useBranding();
  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-[46%] overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700 lg:block">
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '44px 44px' }} />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            {b.hasLogo ? <img src={`/api/public/logo?v=${b.v}`} alt="" className="h-12 w-12 rounded-lg bg-white object-contain p-1" />
              : <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gold-400 text-xl font-black text-navy-950">FH</div>}
            <div><div className="text-xl font-extrabold tracking-wider">{b.name}</div><div className="text-sm text-gold-300">{b.tagline || 'Real Estate & Developers'}</div></div>
          </div>
          <div>
            <h2 className="text-4xl font-bold leading-tight">Land, plots, customers and installments<br /><span className="text-gold-400">in one place.</span></h2>
            <p className="mt-4 max-w-md text-navy-100/80">Bookings, receipts, transfers, expenses and reports, kept safe with automatic backups.</p>
          </div>
          <div className="text-xs text-navy-200/60">Secure office system · Authorised staff only</div>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-navy-900 text-lg font-black text-gold-400">FH</div>
            <div className="text-xl font-extrabold tracking-wider text-navy-900">{b.name}</div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login, setup, notice } = useAuth();
  const [needsSetup, setNeedsSetup] = useState(null);
  const [f, setF] = useState({ username: '', password: '', full_name: '', confirm: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/auth/setup-status').then((d) => setNeedsSetup(d.needsSetup)).catch(() => setNeedsSetup(false)); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      if (needsSetup) {
        if (f.password !== f.confirm) throw new Error('Passwords do not match');
        await setup({ username: f.username, full_name: f.full_name, password: f.password });
      } else await login(f.username, f.password);
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };
  if (needsSetup === null) return <Shell><Spinner /></Shell>;
  return (
    <Shell>
      <h1 className="text-2xl font-bold text-navy-900">{needsSetup ? 'Create administrator' : 'Sign in'}</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">{needsSetup ? 'First-time setup: create the main admin account.' : 'Enter your username and password.'}</p>
      {notice && !needsSetup && <Notice tone="warn" className="mb-4">{notice}</Notice>}
      <form onSubmit={submit} className="space-y-4">
        {needsSetup && <Input label="Full name" required value={f.full_name} onChange={set('full_name')} />}
        <Input label="Username" required autoFocus autoComplete="username" value={f.username} onChange={set('username')} />
        <Input label="Password" type="password" required autoComplete={needsSetup ? 'new-password' : 'current-password'} value={f.password} onChange={set('password')} hint={needsSetup ? 'At least 8 characters' : undefined} />
        {needsSetup && <Input label="Confirm password" type="password" required value={f.confirm} onChange={set('confirm')} />}
        <ErrorBox error={err} />
        <button type="submit" className="btn-primary w-full py-2.5" disabled={busy}>{busy ? <Spinner className="h-4 w-4 text-white" /> : <Lock className="h-4 w-4" />}{needsSetup ? 'Create & sign in' : 'Sign in'}</button>
      </form>
    </Shell>
  );
}

export function ChangePasswordPage({ forced }) {
  const { changePassword, logout } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ current_password: '', new_password: '', confirm: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(null);
    if (f.new_password !== f.confirm) { setErr(new Error('New passwords do not match')); return; }
    setBusy(true);
    try { await changePassword({ current_password: f.current_password, new_password: f.new_password }); toast('Password changed'); setF({ current_password: '', new_password: '', confirm: '' }); } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };
  const form = (
    <form onSubmit={submit} className="space-y-4">
      <Input label="Current password" type="password" required value={f.current_password} onChange={set('current_password')} autoComplete="current-password" />
      <Input label="New password" type="password" required value={f.new_password} onChange={set('new_password')} hint="At least 8 characters" autoComplete="new-password" />
      <Input label="Confirm new password" type="password" required value={f.confirm} onChange={set('confirm')} autoComplete="new-password" />
      <ErrorBox error={err} />
      <div className="flex gap-2"><button type="submit" className="btn-primary" disabled={busy}>Change password</button>
        {forced && <button type="button" className="btn-secondary" onClick={logout}>Log out</button>}</div>
    </form>
  );
  if (forced) return <Shell><h1 className="mb-1 text-2xl font-bold text-navy-900">Set a new password</h1><p className="mb-6 text-sm text-slate-500">For security you must change your password before continuing.</p>{form}</Shell>;
  return <div className="max-w-md"><PageHeader title="Change password" /><Card><Building2 className="hidden" />{form}</Card></div>;
}
