import React, { useState, useEffect, useRef } from 'react';
import { useOutlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLoader, RouteLoader } from '../brand';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

const SIDEBAR_W = 260;

/* Derive a nice page title from pathname */
const getTitle = (pathname: string): string => {
  const map: Record<string, string> = {
    '/dashboard':              'Dashboard',
    '/plots/add':              'Add Plot',
    '/plots/list':             'Plot List',
    '/plots/categories':       'Plot Categories',
    '/plots/map':              'Plot Map',
    '/customers/add':          'Add Customer',
    '/customers/list':         'Customer List',
    '/bookings/new':           'New Booking',
    '/bookings/list':          'Booking List',
    '/sales/new':              'Assign Plot',
    '/sales/list':             'Assigned Plots',
    '/sales/agreement':        'Plot Agreement',
    '/payment-plans/new':      'Create Plan',
    '/payment-plans/list':     'Payment Plans',
    '/payments/receive':       'Receive Payment',
    '/payments/possession':    'On-Possession Payment',
    '/payments/history':       'Payment History',
    '/dealers/add':            'Add Dealer',
    '/dealers/list':           'Dealer List',
    '/dealers/commission':     'Dealer Commission',
    '/dealers/report':         'Commission Report',

    '/reports/daily':          'Daily Report',
    '/reports/sales':          'Sale Report',
    '/reports/bookings':       'Booking Report',
    '/reports/installments':   'Installment Report',
    '/reports/collection':     'Collection Report',
    '/reports/pending':        'Pending Payments',
    '/reports/dealer-commission': 'Dealer Commission Report',
    '/reports/plot-status':    'Plot Status Report',
    '/settings/company':       'Company Info',
    '/settings/users':         'Users Management',
    '/settings/backup':        'Backup Data',
  };
  // Check exact match first, then prefix
  if (map[pathname]) return map[pathname];
  for (const [key, val] of Object.entries(map)) {
    if (pathname.startsWith(key + '/')) return val;
  }
  return 'Faisal Homes';
};

const Layout: React.FC = () => {
  const location = useLocation();
  const outlet = useOutlet();
  const [desktopOpen,  setDesktopOpen]  = useState(true);
  const [mobileOpen,   setMobileOpen]   = useState(false);

  const toggle = () => {
    setDesktopOpen(v => !v);
    setMobileOpen(v => !v);
  };

  const pageTitle = getTitle(location.pathname);

  const { begin, end } = useLoader();
  const firstRender = useRef(true);
  
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    begin();
    const timer = setTimeout(() => {
      end();
    }, 650);
    return () => clearTimeout(timer);
  }, [location.pathname, begin, end]);

  return (
    <div className="min-h-screen bg-[#f0f4f8] flex flex-col relative overflow-x-hidden">
      <Navbar onToggleSidebar={toggle} pageTitle={pageTitle} />

      {/* Desktop sidebar */}
      <motion.div 
        className="fixed left-0 top-0 bottom-0 z-30 hidden lg:block"
        initial={false}
        animate={{ width: desktopOpen ? SIDEBAR_W : 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="pt-16 h-full w-[260px]">
          <Sidebar collapsed={!desktopOpen} />
        </div>
      </motion.div>

      {/* Mobile sidebar backdrop */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile sidebar (absolute, full height) */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ x: -SIDEBAR_W }}
            animate={{ x: 0 }}
            exit={{ x: -SIDEBAR_W }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed left-0 top-0 bottom-0 z-40 lg:hidden"
            style={{ width: SIDEBAR_W }}
          >
            <div className="pt-16 h-full">
              <Sidebar onClose={() => setMobileOpen(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Page content */}
      <motion.main
        className="flex-1 pt-16 min-h-screen transition-none relative"
        animate={{ paddingLeft: desktopOpen ? SIDEBAR_W : 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      >
        <RouteLoader />
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 15, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.99 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="p-5 md:p-6 max-w-[1400px]"
          >
            {outlet}
          </motion.div>
        </AnimatePresence>
      </motion.main>
    </div>
  );
};

export default Layout;
