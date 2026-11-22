import { useState } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard, Landmark, Building2, Grid3x3, Map, Users, FileSignature, PlusCircle, Wallet, Receipt, CalendarClock, ArrowLeftRight,
  ShoppingCart, BarChart3, PiggyBank, Settings, UserCog, History, DatabaseBackup, LogOut, Menu, X, KeyRound,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { t } from '../i18n/index.js';
import { roleLabel } from '../lib/format.js';
import { useBranding } from './Branding.jsx';

const NAV = [
  { group: null, items: [{ to: '/', key: 'dashboard', icon: LayoutDashboard, end: true }] },
  { group: 'property', items: [
    { to: '/lands', key: 'lands', icon: Landmark, perm: 'land.view' },
    { to: '/societies', key: 'societies', icon: Building2, perm: 'society.view' },
    { to: '/plots', key: 'plots', icon: Grid3x3, perm: 'plot.view' },
    { to: '/plot-map', key: 'plotMap', icon: Map, perm: 'plot.view' },
  ] },
  { group: 'sales', items: [
    { to: '/customers', key: 'customers', icon: Users, perm: 'customer.view' },
    { to: '/bookings/new', key: 'newBooking', icon: PlusCircle, perm: 'booking.create' },
    { to: '/bookings', key: 'bookings', icon: FileSignature, perm: 'booking.view', end: true },
    { to: '/transfers', key: 'transfers', icon: ArrowLeftRight, perm: 'transfer.view' },
  ] },
  { group: 'money', items: [
    { to: '/collect', key: 'collect', icon: Wallet, perm: 'payment.create' },
    { to: '/receipts', key: 'receipts', icon: Receipt, perm: 'payment.view' },
    { to: '/installments', key: 'installments', icon: CalendarClock, perm: 'booking.view' },
    { to: '/expenses', key: 'expenses', icon: ShoppingCart, perm: 'expense.view' },
    { to: '/investments', key: 'investments', icon: PiggyBank, perm: 'investment.view' },
    { to: '/reports', key: 'reports', icon: BarChart3, perm: 'report.view' },
  ] },
  { group: 'admin', items: [
    { to: '/settings', key: 'settings', icon: Settings, perm: 'settings.manage' },
    { to: '/users', key: 'users', icon: UserCog, perm: 'users.manage' },
    { to: '/audit', key: 'audit', icon: History, perm: 'audit.view' },
    { to: '/backup', key: 'backup', icon: DatabaseBackup, perm: 'backup.manage' },
  ] },
];

function Brand() {
  const b = useBranding();
  return (
    <Link to="/" className="flex items-center gap-3 px-4 py-5">
      {b.hasLogo ? <img src={`/api/public/logo?v=${b.v}`} alt="" className="h-10 w-10 rounded-lg bg-white object-contain p-0.5" />
        : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-400 text-lg font-black text-navy-950">FH</div>}
      <div className="min-w-0">
        <div className="truncate text-base font-extrabold tracking-wide text-white">{b.name}</div>
        <div className="truncate text-[11px] text-gold-300">{b.tagline || 'Society Management'}</div>
      </div>
    </Link>
  );
}

export default function Layout() {
  const { user, can, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
      {NAV.map((g, gi) => {
        const items = g.items.filter((i) => !i.perm || can(i.perm));
        if (!items.length) return null;
        return (
          <div key={gi}>
            {g.group && <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-navy-200/60">{t(g.group)}</div>}
            <div className="space-y-0.5">
              {items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} onClick={() => setOpen(false)}
                  className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-white/10 text-white shadow-inner ring-1 ring-white/10' : 'text-navy-100/80 hover:bg-white/5 hover:text-white'}`}>
                  {({ isActive }) => <><i.icon className={`h-[18px] w-[18px] ${isActive ? 'text-gold-400' : ''}`} />{t(i.key)}</>}
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
  const sidebar = (
    <div className="flex h-full flex-col bg-gradient-to-b from-navy-950 via-navy-900 to-navy-800">
      <Brand />
      {nav}
      <div className="border-t border-white/10 p-3">
        <div className="mb-2 px-2">
          <div className="truncate text-sm font-semibold text-white">{user.full_name}</div>
          <div className="text-xs text-navy-200/70">{roleLabel(user.role)}</div>
        </div>
        <Link to="/change-password" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-navy-100/80 hover:bg-white/5 hover:text-white"><KeyRound className="h-4 w-4" />{t('changePassword')}</Link>
        <button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-navy-100/80 hover:bg-white/5 hover:text-white"><LogOut className="h-4 w-4" />{t('logout')}</button>
      </div>
    </div>
  );
  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">{sidebar}
            <button type="button" className="absolute right-3 top-5 rounded-lg p-1 text-white/80 hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
          </aside>
        </div>
      )}
      <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <button type="button" className="rounded-lg p-1.5 text-slate-700 hover:bg-slate-100" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-6 w-6" /></button>
        <span className="font-extrabold tracking-wide text-navy-900">FAISAL HOMES</span>
      </header>
      <main key={loc.pathname} className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7"><Outlet /></main>
    </div>
  );
}
