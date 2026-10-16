import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Logo from '../Logo';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Home, PlusCircle, List, Grid, Map,
  Users, UserPlus, BookOpen, ClipboardList, FilePlus, FileText,
  CreditCard, Receipt, History, Handshake, DollarSign, TrendingUp,
  BarChart2, Calendar, FileBarChart, AlertCircle, Settings,
  ChevronDown, UserCheck, Database, Building2, BookMarked,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface NavChild { label: string; path: string; icon: React.ReactNode; adminOnly?: boolean; }
interface NavGroup  {
  label: string; icon: React.ReactNode;
  children?: NavChild[]; path?: string; adminOnly?: boolean;
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
      { label: 'Add Customer',   path: '/customers/add',  icon: <UserPlus size={14} /> },
      { label: 'Customer List',  path: '/customers/list', icon: <List size={14} /> },
    ],
  },
  {
    label: 'Bookings & Sales', icon: <BookOpen size={16} />,
    children: [
      { label: 'New Booking',    path: '/bookings/new',   icon: <FilePlus size={14} /> },
      { label: 'Booking List',   path: '/bookings/list',  icon: <ClipboardList size={14} /> },
      { label: 'Assign Plot',    path: '/sales/new',      icon: <UserCheck size={14} /> },
      { label: 'Assigned Plots', path: '/sales/list',     icon: <List size={14} /> },
      { label: 'Plot Agreement', path: '/sales/agreement',icon: <FileText size={14} /> },
    ],
  },
  {
    label: 'Payments', icon: <CreditCard size={16} />,
    children: [
      { label: 'Create Plan',    path: '/payment-plans/new',        icon: <PlusCircle size={14} /> },
      { label: 'Payment Plans',  path: '/payment-plans/list',       icon: <List size={14} /> },
      { label: 'Receive Payment',path: '/payments/receive',         icon: <Receipt size={14} /> },
      { label: 'Down Payments',  path: '/payments/down-payments',   icon: <DollarSign size={14} /> },
      { label: 'On-Possession',  path: '/payments/possession',      icon: <BookMarked size={14} /> },
      { label: 'Payment History',path: '/payments/history',         icon: <History size={14} /> },
    ],
  },
  {
    label: 'Dealers', icon: <Handshake size={16} />,
    children: [
      { label: 'Add Dealer',       path: '/dealers/add',        icon: <PlusCircle size={14} /> },
      { label: 'Dealer List',      path: '/dealers/list',       icon: <List size={14} /> },
      { label: 'Commission',       path: '/dealers/commission', icon: <DollarSign size={14} /> },
      { label: 'Comm. Report',     path: '/dealers/report',     icon: <FileBarChart size={14} /> },
    ],
  },

  {
    label: 'Reports', icon: <BarChart2 size={16} />,
    children: [
      { label: 'Daily Report',      path: '/reports/daily',              icon: <Calendar size={14} /> },
      { label: 'Sale Report',       path: '/reports/sales',              icon: <BarChart2 size={14} /> },
      { label: 'Booking Report',    path: '/reports/bookings',           icon: <BookOpen size={14} /> },
      { label: 'Installment',       path: '/reports/installments',       icon: <Receipt size={14} /> },
      { label: 'Collection',        path: '/reports/collection',         icon: <DollarSign size={14} /> },
      { label: 'Pending Payments',  path: '/reports/pending',            icon: <AlertCircle size={14} /> },
      { label: 'Shortage List',     path: '/reports/shortage-list',      icon: <AlertCircle size={14} /> },
      { label: 'Dealer Commission', path: '/reports/dealer-commission',  icon: <Handshake size={14} /> },
      { label: 'Plot Status',       path: '/reports/plot-status',        icon: <Home size={14} /> },
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

  const initialOpen = nav
    .filter(g => g.children?.some(c => location.pathname === c.path || location.pathname.startsWith(c.path + '/')))
    .map(g => g.label)[0] || null;

  const [open, setOpen] = useState<string | null>(initialOpen);

  React.useEffect(() => {
    const currentGroup = nav
      .filter(g => g.children?.some(c => location.pathname === c.path || location.pathname.startsWith(c.path + '/')))
      .map(g => g.label)[0] || null;
    if (currentGroup) {
      setOpen(currentGroup);
    }
  }, [location.pathname]);

  const toggle = (label: string) =>
    setOpen(p => p === label ? null : label);

  const isGroupActive = (children: NavChild[]) =>
    children.some(c => location.pathname === c.path || location.pathname.startsWith(c.path + '/'));

  return (
    <div
      className="h-full flex flex-col overflow-y-auto overflow-x-hidden"
      style={{ background: '#1a3c6e' }}
    >
      {/* ── Logo ── */}
      <div
        className="flex items-center gap-3 px-4 h-16 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <Logo size={36} />
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-tight truncate">Faisal Homes</p>
            <p className="text-white/40 text-[10px] truncate">Property Management</p>
          </div>
        )}
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
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

          /* Group */
          const isOpen   = open === item.label;
          const isActive = item.children ? isGroupActive(item.children) : false;

          return (
            <div key={item.label}>
              <button
                onClick={() => toggle(item.label)}
                className={`sidebar-link w-full ${
                  isActive ? 'text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
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
                {isOpen && !collapsed && item.children && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{   height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="ml-3 pl-3 py-1 space-y-0.5" style={{ borderLeft: '1px solid rgba(255,255,255,0.12)' }}>
                      {item.children.map(child => {
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
