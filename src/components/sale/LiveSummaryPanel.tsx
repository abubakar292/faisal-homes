import React, { useState, useEffect } from 'react';
import {
  CheckCircle2, AlertTriangle, ChevronUp, X, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency } from '../../utils/formatters';
import { useScrollLock } from '../../hooks/useScrollLock';

interface LiveSummaryPanelProps {
  mode: 'sale' | 'booking';
  customerName: string;
  plotLabel: string;
  finalPrice: number;
  downPaymentAmount: number;
  remainingDownPayment: number;
  bookingPaid: number;
  onPossessionEnabled: boolean;
  onPossessionAmount: number;
  semiAnnualEnabled: boolean;
  semiAnnualTotal: number;
  planSummaryText: string;
  monthlyInstallmentText?: string;
  dealerName?: string;
  dealerCommissionAmount?: number;
  grandTotal: number;
  difference: number;
  isExact: boolean;
  isRounding?: boolean;
  isMismatch?: boolean;
}

export const LiveSummaryPanel: React.FC<LiveSummaryPanelProps> = ({
  mode,
  customerName,
  plotLabel,
  finalPrice,
  downPaymentAmount,
  remainingDownPayment,
  bookingPaid,
  onPossessionEnabled,
  onPossessionAmount,
  semiAnnualEnabled,
  semiAnnualTotal,
  planSummaryText,
  monthlyInstallmentText,
  dealerName,
  dealerCommissionAmount = 0,
  grandTotal,
  difference,
  isExact,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  useScrollLock(mobileOpen);

  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  const exactCheck = isExact && finalPrice > 0;

  const summaryContent = (
    <>
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Live Summary
        </span>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
          style={{ background: '#1a3c6e', color: '#e7b861' }}
        >
          {mode === 'booking' ? 'Booking Mode' : 'Sale Mode'}
        </span>
      </div>

      {/* Selected Customer & Plot */}
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Customer:</span>
          <span className="font-semibold text-slate-800 truncate max-w-[170px]" title={customerName}>
            {customerName || 'None selected'}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Plot:</span>
          <span className="font-semibold text-[#1a3c6e] truncate max-w-[170px]" title={plotLabel}>
            {plotLabel || 'None selected'}
          </span>
        </div>
      </div>

      {/* Pricing & Breakdowns */}
      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-2 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-slate-600 font-medium">Final Price:</span>
          <span className="font-extrabold text-sm text-[#1a3c6e]">
            {formatCurrency(finalPrice)}
          </span>
        </div>

        <div className="flex justify-between items-center text-slate-600">
          <span>Down Payment:</span>
          <span className="font-semibold">{formatCurrency(downPaymentAmount)}</span>
        </div>

        {bookingPaid > 0 && (
          <div className="flex justify-between items-center text-emerald-700">
            <span>Booking Paid:</span>
            <span>- {formatCurrency(bookingPaid)}</span>
          </div>
        )}

        <div className="flex justify-between items-center text-slate-800 font-bold pt-1 border-t border-slate-200/70">
          <span>Remaining DP:</span>
          <span>{formatCurrency(remainingDownPayment)}</span>
        </div>

        {onPossessionEnabled && (
          <div className="flex justify-between items-center text-slate-600">
            <span>On Possession:</span>
            <span className="font-semibold">{formatCurrency(onPossessionAmount)}</span>
          </div>
        )}

        {mode === 'sale' && semiAnnualEnabled && (
          <div className="flex justify-between items-center text-slate-600">
            <span>Semi-Annual Total:</span>
            <span className="font-semibold">{formatCurrency(semiAnnualTotal)}</span>
          </div>
        )}
      </div>

      {/* Plan Details (for sale) */}
      {mode === 'sale' && (
        <div className="space-y-1.5 text-xs pt-1">
          <div className="flex justify-between text-slate-500">
            <span>Plan:</span>
            <span className="font-medium text-slate-800">{planSummaryText || '-'}</span>
          </div>
          {monthlyInstallmentText && (
            <div className="flex justify-between text-slate-500">
              <span>Monthly:</span>
              <span className="font-medium text-slate-800">{monthlyInstallmentText}</span>
            </div>
          )}
        </div>
      )}

      {/* Dealer Commission (if applicable) */}
      {dealerCommissionAmount > 0 && (
        <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-100 text-xs flex justify-between items-center text-blue-900">
          <span className="truncate">Dealer ({dealerName || 'Assigned'}):</span>
          <span className="font-bold">{formatCurrency(dealerCommissionAmount)}</span>
        </div>
      )}

      {/* Grand Total Match Check */}
      {mode === 'sale' && finalPrice > 0 && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            exactCheck
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-amber-50 text-amber-800 border-amber-200'
          }`}
        >
          <div className="flex items-center gap-1.5">
            {exactCheck ? (
              <CheckCircle2 size={15} className="text-emerald-600" />
            ) : (
              <AlertTriangle size={15} className="text-amber-600" />
            )}
            <span>{exactCheck ? 'Balance Exact' : 'Difference'}</span>
          </div>
          <span>
            {exactCheck
              ? formatCurrency(finalPrice)
              : `${formatCurrency(Math.abs(difference))} diff`}
          </span>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* ── Desktop Sticky Panel (xl+) ── */}
      <div className="hidden xl:block w-80 sticky top-20 self-start bg-white rounded-2xl border border-slate-200/90 shadow-md p-5 space-y-4">
        {summaryContent}
      </div>

      {/* ── Floating Pill Trigger (< xl) ── */}
      <div className="xl:hidden fixed bottom-24 right-4 z-30">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="View live summary"
          className="flex items-center gap-2 bg-[#1a3c6e] text-white px-3.5 py-2.5 rounded-full shadow-2xl border-2 border-[#e7b861] active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e8a020]"
        >
          <Sparkles size={15} className="text-[#e7b861]" />
          <span className="text-xs font-bold">
            Total: {formatCurrency(finalPrice)}
          </span>
          {mode === 'sale' && finalPrice > 0 && !exactCheck && (
            <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-bold">
              Diff
            </span>
          )}
          <ChevronUp size={16} className="text-[#e7b861]" />
        </button>
      </div>

      {/* ── Mobile Bottom Sheet (< xl) ── */}
      <AnimatePresence>
        {mobileOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Live Sale Summary"
            className="fixed inset-0 z-50 flex items-end justify-center xl:hidden"
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />

            {/* Bottom Sheet */}
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              className="relative z-10 w-full max-h-[85dvh] bg-white rounded-t-2xl shadow-2xl p-5 space-y-4 overflow-y-auto fixed inset-x-0 bottom-0"
              style={{
                paddingBottom: 'calc(1.5rem + var(--safe-bottom))',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Drag Handle */}
              <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto -mt-1 mb-2 flex-shrink-0" />

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close summary sheet"
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>

              {summaryContent}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default LiveSummaryPanel;
