import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Logo from '../Logo';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Home, PlusCircle, List, Grid, Map,
  Users, BookOpen, ClipboardList, CreditCard, Receipt,
  History, Handshake, DollarSign, BarChart2, Calendar,
  AlertCircle, Settings, ChevronDown, Database, Building2,
  FileText, Plus, X
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface NavChild {
  label: string;
  path: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

interface NavSubGroup {
  subheading?: string;
  items: NavChild[];
}

interface NavGroup {
  label: string;
  icon: React.ReactNode;
  children?: NavChild[];
  subgroups?: NavSubGroup[];
  path?: string;
  adminOnly?: boolean;
}

const nav: NavGroup[] = [
  { label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={16} /> },
  {
    label: 'Plots', icon: <Home size={16} />,
    children: [
      { label: 'Add Plot',    path: '/plots/add',        icon: <PlusCircle size={14} /> },
      { label: 'Plot List',   path: '/plots/list',       icon: <List size={14} /> },
      { label: 'Categories',  path: '/plots/categories', icon: <Grid size={14} /> },
      { label: 'Plot Map',    path: '/plots/map',        icon: <Map size={14} /> },
    ],
  },
  {
    label: 'Customers', icon: <Users size={16} />,
    children: [
      { label: 'Customer List',  path: '/customers/list', icon: <List size={14} /> },
    ],
  },
  {
    label: 'Bookings & Sales', icon: <BookOpen size={16} />,
    children: [
      { label: 'Booking List',   path: '/bookings/list',  icon: <ClipboardList size={14} /> },
      { label: 'Sales List',     path: '/sales/list',     icon: <List size={14} /> },
    ],
  },
  {
    label: 'Payments', icon: <CreditCard size={16} />,
    children: [
      { label: 'Receive Payment',path: '/payments/receive',         icon: <Receipt size={14} /> },
      { label: 'Down Payments',  path: '/payments/down-payments',   icon: <DollarSign size={14} /> },
      { label: 'Payment History',path: '/payments/history',         icon: <History size={14} /> },
    ],
  },
  {
    label: 'Dealers', icon: <Handshake size={16} />,
    children: [
      { label: 'Dealer List',      path: '/dealers/list',       icon: <List size={14} /> },
      { label: 'Commission',       path: '/dealers/commission', icon: <DollarSign size={14} /> },
    ],
  },
  {
    label: 'Reports', icon: <BarChart2 size={16} />,
    children: [
      { label: 'Overview', path: '/reports', icon: <Calendar size={14} /> },
    ],
    subgroups: [
      {
        subheading: 'SALES & BOOKINGS',
        items: [
          { label: 'Sale Report',      path: '/reports/sales',              icon: <BarChart2 size={14} /> },
          { label: 'Booking Report',   path: '/reports/bookings',           icon: <BookOpen size={14} /> },
        ],
      },
      {
        subheading: 'COLLECTIONS',
        items: [
          { label: 'Daily Report',     path: '/reports/daily',              icon: <Calendar size={14} /> },
          { label: 'Collection',       path: '/reports/collection',         icon: <DollarSign size={14} /> },
          { label: 'Installment',      path: '/reports/installments',       icon: <Receipt size={14} /> },
          { label: 'Pending Payments', path: '/reports/pending',            icon: <AlertCircle size={14} /> },
          { label: 'Shortage List',    path: '/reports/shortage-list',      icon: <AlertCircle size={14} /> },
        ],
      },
      {
        subheading: 'COMMISSIONS & ASSETS',
        items: [
          { label: 'Dealer Commission',path: '/reports/dealer-commission',  icon: <Handshake size={14} /> },
          { label: 'Plot Status',      path: '/reports/plot-status',        icon: <Home size={14} /> },
        ],
      },
    ],
  },
  {
    label: 'Settings', icon: <Settings size={16} />,
    children: [
      { label: 'Company Info', path: '/settings/company', icon: <Building2 size={14} /> },
      { label: 'Terms & Conditions', path: '/settings/terms', icon: <FileText size={14} /> },
      { label: 'Users',        path: '/settings/users',   icon: <Users size={14} />, adminOnly: true },
      { label: 'Backup Data',  path: '/settings/backup',  icon: <Database size={14} /> },
    ],
  },
];

interface SidebarProps { collapsed?: boolean; onClose?: () => void; }

const Sidebar: React.FC<SidebarProps> = ({ collapsed = false, onClose }) => {
  const location = useLocation();
  const { isAdmin } = useAuth();

  const getActiveGroup = (pathname: string): string | null => {
    for (const g of nav) {
      if (g.children?.some(c => pathname === c.path || pathname.startsWith(c.path + '/'))) {
        return g.label;
      }
      if (g.subgroups?.some(sg => sg.items.some(c => pathname === c.path || pathname.startsWith(c.path + '/')))) {
        return g.label;
      }
    }
    return null;
  };

  const [open, setOpen] = useState<string | null>(() => {
    const active = getActiveGroup(location.pathname);
    if (active) return active;
    try {
      return localStorage.getItem('fh_sidebar_open');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const currentGroup = getActiveGroup(location.pathname);
    if (currentGroup) {
      setOpen(currentGroup);
      try {
        localStorage.setItem('fh_sidebar_open', currentGroup);
      } catch {}
    }
  }, [location.pathname]);

  const toggle = (label: string) => {
    setOpen(prev => {
      const next = prev === label ? null : label;
      try {
        if (next) {
          localStorage.setItem('fh_sidebar_open', next);
        } else {
          localStorage.removeItem('fh_sidebar_open');
        }
      } catch {}
      return next;
    });
  };

  const isGroupActive = (item: NavGroup): boolean => {
    if (item.children?.some(c => location.pathname === c.path || location.pathname.startsWith(c.path + '/'))) {
      return true;
    }
    if (item.subgroups?.some(sg => sg.items.some(c => location.pathname === c.path || location.pathname.startsWith(c.path + '/')))) {
      return true;
    }
    return false;
  };

  return (
    <div
      className="h-full flex flex-col overflow-y-auto overflow-x-hidden"
      style={{ background: '#1a3c6e' }}
    >
      {/* ── Logo Header ── */}
      <div
        className="flex items-center justify-between px-4 h-14 sm:h-16 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Logo size={32} />
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-white font-bold text-sm leading-tight truncate">Faisal Homes</p>
              <p className="text-white/40 text-[10px] truncate">Property Management</p>
            </div>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close navigation menu"
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 lg:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e8a020]"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* ── "+ New Sale" Accent Button ── */}
      <div className={collapsed ? 'px-2 pt-3 pb-2 flex justify-center' : 'px-3 pt-3 pb-2'}>
        <NavLink
          to="/sales/new"
          onClick={onClose}
          id="sidebar-new-sale-accent-btn"
          className={
            collapsed
              ? 'w-10 h-10 flex items-center justify-center rounded-xl font-bold shadow-md transition-all duration-200 hover:scale-105 active:scale-95'
              : 'w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold text-xs tracking-wide shadow-md transition-all duration-200 hover:brightness-105 active:scale-98'
          }
          style={{
            background: 'linear-gradient(135deg, #e7b861 0%, #d49f3e 100%)',
            color: '#0f2444',
            boxShadow: '0 4px 14px rgba(231, 184, 97, 0.3)',
          }}
          title="New Sale"
        >
          <Plus size={collapsed ? 20 : 16} strokeWidth={2.5} />
          {!collapsed && <span>+ New Sale</span>}
        </NavLink>
      </div>

      {/* ── Navigation List ── */}
      <nav className="flex-1 py-1 px-2 space-y-0.5">
        {nav.map(item => {
          if (item.adminOnly && !isAdmin) return null;

          /* Direct link */
          if (item.path) {
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={({ isActive }: { isActive: boolean }) =>
                  `sidebar-link ${isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'}`
                }
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );
          }

          /* Group with children / subgroups */
          const isOpen   = open === item.label;
          const isActive = isGroupActive(item);

          return (
            <div key={item.label}>
              <button
                onClick={() => toggle(item.label)}
                className={`sidebar-link w-full ${
                  isActive ? 'text-white font-semibold' : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
                style={{ borderLeft: '3px solid transparent' }}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    <ChevronDown
                      size={13}
                      className={`transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </>
                )}
              </button>

              <AnimatePresence initial={false}>
                {isOpen && !collapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{   height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="ml-3 pl-3 py-1 space-y-0.5" style={{ borderLeft: '1px solid rgba(255,255,255,0.12)' }}>
                      {/* Direct children */}
                      {item.children?.map(child => {
                        if (child.adminOnly && !isAdmin) return null;
                        return (
                          <NavLink
                            key={child.path}
                            to={child.path}
                            onClick={onClose}
                            className={({ isActive }: { isActive: boolean }) =>
                              `sidebar-link text-xs py-2 ${isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'}`
                            }
                          >
                            <span className="flex-shrink-0">{child.icon}</span>
                            <span className="truncate">{child.label}</span>
                          </NavLink>
                        );
                      })}

                      {/* Subgroups with section subheadings */}
                      {item.subgroups?.map((sg, sgIdx) => (
                        <div key={sgIdx} className="pt-2">
                          {sg.subheading && (
                            <div className="px-3 pb-1 text-[9px] font-bold tracking-wider text-white/40 uppercase">
                              {sg.subheading}
                            </div>
                          )}
                          <div className="space-y-0.5">
                            {sg.items.map(child => {
                              if (child.adminOnly && !isAdmin) return null;
                              return (
                                <NavLink
                                  key={child.path}
                                  to={child.path}
                                  onClick={onClose}
                                  className={({ isActive }: { isActive: boolean }) =>
                                    `sidebar-link text-xs py-2 ${isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'}`
                                  }
                                >
                                  <span className="flex-shrink-0">{child.icon}</span>
                                  <span className="truncate">{child.label}</span>
                                </NavLink>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>

      {/* ── Footer ── */}
      {!collapsed && (
        <div
          className="px-4 py-3 flex-shrink-0 text-center space-y-0.5"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
        >
          <p className="text-white/30 text-[10px]">Faisal Homes v1.0</p>
          <p className="text-white/20 text-[9px]">Powered by Ahmad's Technology</p>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
