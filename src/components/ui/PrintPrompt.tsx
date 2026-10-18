import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Printer, X } from 'lucide-react';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useScrollLock } from '../../hooks/useScrollLock';

interface PrintOption {
  label: string;
  onClick: () => void;
}

interface PrintPromptProps {
  show: boolean;
  title?: string;
  message?: string;
  options: PrintOption[];
  onClose: () => void;
}

const PrintPrompt: React.FC<PrintPromptProps> = ({
  show,
  title = 'Saved Successfully!',
  message = 'Would you like to print?',
  options,
  onClose,
}) => {
  const { isSm } = useBreakpoint();
  useScrollLock(show);

  useEffect(() => {
    if (!show) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [show, onClose]);

  return (
    <AnimatePresence>
      {show && (
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
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={isSm ? { opacity: 0, scale: 0.94, y: 12 } : { y: '100%', opacity: 0 }}
            animate={isSm ? { opacity: 1, scale: 1, y: 0 } : { y: 0, opacity: 1 }}
            exit={isSm ? { opacity: 0, scale: 0.94, y: 12 } : { y: '100%', opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
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

            {/* Close button */}
            <div className="flex justify-end px-4 pt-2">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close print prompt"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a3c6e]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Header */}
            <div className="text-center px-6 pt-1 pb-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)' }}
              >
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <h3 className="font-bold text-base sm:text-lg text-slate-900">{title}</h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">{message}</p>
            </div>

            {/* Actions */}
            <div className="px-5 sm:px-6 pb-5 space-y-2.5">
              {options.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    opt.onClick();
                    onClose();
                  }}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1a3c6e] hover:bg-[#0f2548] text-white rounded-xl text-sm font-semibold transition-all active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e8a020]"
                >
                  <Printer size={16} />
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                onClick={onClose}
                className="w-full min-h-[44px] px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                Skip
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default PrintPrompt;
