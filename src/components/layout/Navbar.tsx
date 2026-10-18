import React, { useState, useEffect } from 'react';
import { Menu, LogOut, User, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import NotificationBell from './NotificationBell';
import BrandMark from '../brand/BrandMark';

interface Props {
  onToggleSidebar: () => void;
  pageTitle?: string;
}

const Navbar: React.FC<Props> = ({ onToggleSidebar, pageTitle = 'Dashboard' }) => {
  const { appUser, currentUser, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const displayName = appUser?.name || currentUser?.email?.split('@')[0] || 'User';
  const initials    = displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Close on Escape key
  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  const handleLogout = async () => {
    try {
      setMenuOpen(false);
      await logout();
      toast.success('Signed out successfully');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  return (
    <header
      className="fixed top-0 left-0 right-0 h-14 sm:h-16 z-40 flex items-center px-3 sm:px-4 gap-2 sm:gap-4 transition-all"
      style={{
        background: '#1a3c6e',
        borderBottom: '2px solid #e8a020',
        boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
        paddingTop: 'var(--safe-top)',
      }}
    >
      {/* Hamburger */}
      <button
        id="navbar-hamburger"
        onClick={onToggleSidebar}
        aria-label="Toggle navigation menu"
        className="p-2 -ml-1 rounded-xl hover:bg-white/10 text-white transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e8a020]"
      >
        <Menu size={20} />
      </button>

      {/* Brand mark & name on phones, plus page title on sm+ */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
          <BrandMark size={26} className="flex-shrink-0" />
          <span className="text-white font-bold text-sm sm:text-base tracking-wide truncate">
            Faisal Homes
          </span>
        </div>

        {pageTitle && pageTitle !== 'Faisal Homes' && (
          <div className="hidden sm:flex items-center gap-2 min-w-0 flex-1 border-l border-white/20 pl-3">
            <h1 className="text-white/90 font-medium text-sm tracking-wide truncate" title={pageTitle}>
              {pageTitle}
            </h1>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        {/* Notification bell */}
        <NotificationBell />

        {/* User avatar + dropdown */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(s => !s)}
            aria-label="User account menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2 px-1.5 sm:px-2.5 py-1.5 rounded-xl hover:bg-white/10 transition-colors text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e8a020]"
          >
            {/* Avatar */}
            {currentUser?.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt={displayName}
                className="w-8 h-8 rounded-full border-2 border-white/30 object-cover"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 border-white/30"
                style={{ background: '#e8a020', color: 'white' }}
              >
                {initials}
              </div>
            )}

            <div className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-xs font-semibold max-w-[100px] truncate">{displayName}</span>
              <span className="text-[10px] text-white/60 capitalize">{appUser?.role || 'user'}</span>
            </div>

            {isAdmin && (
              <span
                className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                style={{ background: 'rgba(232,160,32,0.25)', color: '#fbbf24' }}
              >
                Admin
              </span>
            )}

            <ChevronDown
              size={13}
              className={`text-white/60 transition-transform duration-200 hidden sm:block ${menuOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Dropdown Menu */}
          <AnimatePresence>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-1rem))] bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden z-50 max-h-[calc(100dvh-5rem)] flex flex-col"
                >
                  {/* User info */}
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex-shrink-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{displayName}</p>
                    <p className="text-xs text-slate-500 truncate">{currentUser?.email}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize"
                        style={
                          isAdmin
                            ? { background: '#eff6ff', color: '#1d4ed8' }
                            : { background: '#dcfce7', color: '#15803d' }
                        }
                      >
                        {appUser?.role || 'user'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="py-1 overflow-y-auto">
                    <button
                      onClick={() => { setMenuOpen(false); navigate('/settings/company'); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <User size={14} className="text-slate-400" />
                      Settings
                    </button>
                    <div className="border-t border-slate-100 my-1" />
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut size={14} />
                      Sign Out
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
