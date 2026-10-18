import React, { useState, useEffect, useRef } from 'react';
import { useOutlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLoader, RouteLoader } from '../brand';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useScrollLock } from '../../hooks/useScrollLock';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

const SIDEBAR_EXPANDED_W = 260;
const SIDEBAR_COLLAPSED_W = 70;

/* Derive a readable page title from pathname */
const getTitle = (pathname: string): string => {
  const map: Record<string, string> = {
    '/dashboard':                 'Dashboard',
    '/plots/add':                 'Add Plot',
    '/plots/list':                'Plot List',
    '/plots/categories':          'Plot Categories',
    '/plots/map':                 'Plot Map',
    '/customers/add':             'Add Customer',
    '/customers/list':            'Customer List',
    '/bookings/list':             'Booking List',
    '/sales/new':                 'New Sale',
    '/sales/list':                'Sales List',
    '/payment-plans/new':         'Create Plan',
    '/payment-plans/list':        'Payment Plans',
    '/payments/receive':          'Receive Payment',
    '/payments/history':          'Payment History',
    '/payments/down-payments':    'Down Payments',
    '/dealers/add':               'Add Dealer',
    '/dealers/list':              'Dealer List',
    '/dealers/commission':        'Dealer Commission',

    '/reports':                   'Reports Overview',
    '/reports/daily':             'Daily Report',
    '/reports/sales':             'Sale Report',
    '/reports/bookings':          'Booking Report',
    '/reports/installments':      'Installment Report',
    '/reports/collection':        'Collection Report',
    '/reports/pending':           'Pending Payments',
    '/reports/dealer-commission': 'Dealer Commission Report',
    '/reports/plot-status':       'Plot Status Report',
    '/reports/shortage-list':      'Shortage List',
    '/settings/company':          'Company Info',
    '/settings/users':            'Users Management',
    '/settings/backup':           'Backup Data',
    '/settings/terms':            'Terms and Conditions',
  };

  if (map[pathname]) return map[pathname];
  for (const [key, val] of Object.entries(map)) {
    if (pathname.startsWith(key + '/')) return val;
  }
  return 'Faisal Homes';
};

const Layout: React.FC = () => {
  const location = useLocation();
  const outlet = useOutlet();
  const { isDesktop } = useBreakpoint();

  // Desktop sidebar collapsed/open (contract: 1024-1279 starts collapsed, 1280+ starts open, user preference remembered)
  const [desktopOpen, setDesktopOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('fh_sidebar_open_desktop');
      if (stored !== null) return stored === 'true';
      if (typeof window !== 'undefined') {
        return window.innerWidth >= 1280;
      }
    } catch {}
    return true;
  });

  // Mobile/tablet drawer state
  const [mobileOpen, setMobileOpen] = useState(false);

  // Body scroll lock on mobile drawer
  useScrollLock(mobileOpen);

  // Swipe detection refs
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);

  // Toggle handlers separated by breakpoint
  const toggleDesktop = () => {
    setDesktopOpen(prev => {
      const next = !prev;
      try {
        localStorage.setItem('fh_sidebar_open_desktop', String(next));
      } catch {}
      return next;
    });
  };

  const toggle = () => {
    if (isDesktop) {
      toggleDesktop();
    } else {
      setMobileOpen(prev => !prev);
    }
  };

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Esc key closes mobile drawer
  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  // Restore focus to hamburger button when drawer closes
  const prevMobileOpen = useRef(mobileOpen);
  useEffect(() => {
    if (prevMobileOpen.current && !mobileOpen) {
      const hamburger = document.getElementById('navbar-hamburger');
      hamburger?.focus();
    }
    prevMobileOpen.current = mobileOpen;
  }, [mobileOpen]);

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
    <div className="min-h-[100dvh] bg-[#f0f4f8] flex flex-col relative overflow-x-hidden">
      <Navbar onToggleSidebar={toggle} pageTitle={pageTitle} />

      {/* Desktop sidebar (fixed, visible from lg only) */}
      <motion.aside
        className="fixed left-0 top-0 bottom-0 z-30 hidden lg:block overflow-hidden"
        initial={false}
        animate={{ width: desktopOpen ? SIDEBAR_EXPANDED_W : SIDEBAR_COLLAPSED_W }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        aria-label="Desktop navigation"
      >
        <div
          className="pt-16 h-full transition-[width] duration-250 ease-out"
          style={{ width: desktopOpen ? `${SIDEBAR_EXPANDED_W}px` : `${SIDEBAR_COLLAPSED_W}px` }}
        >
          <Sidebar collapsed={!desktopOpen} onExpand={() => setDesktopOpen(true)} />
        </div>
      </motion.aside>

      {/* Mobile/tablet drawer dialog */}
      <AnimatePresence>
        {mobileOpen && (
          <div
            className="fixed inset-0 z-50 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation drawer"
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />

            {/* Drawer panel with swipe-to-close */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="fixed left-0 top-0 bottom-0 z-50 bg-[#1a3c6e] shadow-2xl flex flex-col focus:outline-none"
              style={{
                width: 'min(86vw, 300px)',
                paddingTop: 'var(--safe-top)',
                paddingBottom: 'var(--safe-bottom)',
                paddingLeft: 'var(--safe-left)',
              }}
              onTouchStart={(e) => {
                touchStartX.current = e.touches[0].clientX;
                touchStartY.current = e.touches[0].clientY;
              }}
              onTouchEnd={(e) => {
                const deltaX = e.changedTouches[0].clientX - touchStartX.current;
                const deltaY = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
                if (deltaX < -50 && deltaY < 80) {
                  setMobileOpen(false);
                }
              }}
            >
              <Sidebar onClose={() => setMobileOpen(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Page content */}
      <motion.main
        className="flex-1 pt-14 sm:pt-16 min-h-[100dvh] transition-none relative"
        animate={{ paddingLeft: isDesktop ? (desktopOpen ? SIDEBAR_EXPANDED_W : SIDEBAR_COLLAPSED_W) : 0 }}
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
            className="p-3 sm:p-5 lg:p-6 max-w-[1400px]"
            style={{
              paddingLeft: 'max(0.75rem, var(--safe-left))',
              paddingRight: 'max(0.75rem, var(--safe-right))',
            }}
          >
            {outlet}
          </motion.div>
        </AnimatePresence>
      </motion.main>
    </div>
  );
};

export default Layout;
