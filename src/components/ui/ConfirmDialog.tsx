import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useScrollLock } from '../../hooks/useScrollLock';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: 'danger' | 'primary';
  loading?: boolean;
}

const ConfirmDialog: React.FC<Props> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message,
  confirmLabel = 'Delete',
  confirmVariant = 'danger',
  loading = false,
}) => {
  const { isSm } = useBreakpoint();
  useScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={isSm ? { opacity: 0, scale: 0.94, y: 12 } : { y: '100%', opacity: 0 }}
            animate={isSm ? { opacity: 1, scale: 1, y: 0 } : { y: 0, opacity: 1 }}
            exit={isSm ? { opacity: 0, scale: 0.94, y: 12 } : { y: '100%', opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            className={`
              relative z-10 w-full bg-white shadow-2xl overflow-hidden flex flex-col
              ${isSm ? 'rounded-2xl max-w-sm mx-4' : 'rounded-t-2xl fixed inset-x-0 bottom-0'}
            `}
            style={{
              paddingBottom: isSm ? undefined : 'calc(1rem + var(--safe-bottom))',
            }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            {!isSm && (
              <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto my-2.5 flex-shrink-0" />
            )}

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 flex-shrink-0">
              <h3 className="font-bold text-slate-800 text-sm truncate">{title}</h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close confirmation dialog"
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a3c6e]"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-5 flex flex-col items-center text-center gap-3 overflow-y-auto max-h-[60dvh]">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: '#fee2e2' }}
              >
                <AlertTriangle size={24} style={{ color: '#b91c1c' }} />
              </div>
              <p className="text-sm text-slate-600 leading-relaxed break-anywhere">{message}</p>
            </div>

            {/* Footer */}
            <div className="px-5 pb-4 sm:pb-5 pt-2 flex gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary flex-1 justify-center min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={loading}
                className={`flex-1 justify-center min-h-[44px] ${
                  confirmVariant === 'danger' ? 'btn-danger' : 'btn-primary'
                } btn disabled:opacity-60`}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  confirmLabel
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmDialog;
