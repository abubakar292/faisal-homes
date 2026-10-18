import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useScrollLock } from '../../hooks/useScrollLock';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  footer?: React.ReactNode;
}

const widths: Record<'sm' | 'md' | 'lg' | 'xl' | 'full', string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
  full: 'sm:max-w-5xl',
};

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  footer,
}) => {
  const { isSm } = useBreakpoint();
  useScrollLock(isOpen);

  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Remember trigger element to restore focus on close
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement | null;
    } else if (triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [isOpen]);

  // Close on Escape & focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const visibleFocusables = Array.from(focusables).filter(
          el => !el.hasAttribute('disabled') && el.offsetParent !== null
        );

        if (visibleFocusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = visibleFocusables[0];
        const last = visibleFocusables[visibleFocusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Focus first element or close button upon open
  useEffect(() => {
    if (isOpen && modalRef.current) {
      const focusables = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length > 0) {
        setTimeout(() => focusables[0]?.focus(), 50);
      }
    }
  }, [isOpen]);

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

          {/* Modal Container */}
          <motion.div
            ref={modalRef}
            initial={isSm ? { opacity: 0, scale: 0.94, y: 12 } : { y: '100%', opacity: 0 }}
            animate={isSm ? { opacity: 1, scale: 1, y: 0 } : { y: 0, opacity: 1 }}
            exit={isSm ? { opacity: 0, scale: 0.94, y: 12 } : { y: '100%', opacity: 0 }}
            transition={
              isSm
                ? { duration: 0.2, ease: [0.32, 0.72, 0, 1] }
                : { duration: 0.25, ease: [0.32, 0.72, 0, 1] }
            }
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            className={`
              relative z-10 w-full bg-white flex flex-col overflow-hidden shadow-2xl
              ${
                isSm
                  ? `rounded-2xl max-h-[90dvh] mx-4 my-6 ${widths[size]}`
                  : 'rounded-t-2xl rounded-b-none max-h-[92dvh] fixed inset-x-0 bottom-0'
              }
            `}
          >
            {/* Mobile Drag Handle */}
            {!isSm && (
              <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto my-2.5 flex-shrink-0" />
            )}

            {/* Sticky Header */}
            <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 flex-shrink-0">
              <h3 className="text-sm sm:text-base font-bold text-primary truncate pr-2">
                {title}
              </h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a3c6e] flex-shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto flex-1 overscroll-contain">
              {children}
            </div>

            {/* Sticky Footer */}
            {footer && (
              <div
                className="sticky bottom-0 bg-slate-50 border-t border-slate-100 px-4 sm:px-6 py-3 sm:py-4 flex justify-end gap-3 flex-shrink-0"
                style={{
                  paddingBottom: isSm ? undefined : 'calc(1rem + var(--safe-bottom))',
                }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default Modal;
