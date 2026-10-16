import React, { useState, useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import gsap from 'gsap';
import { formatCurrency } from '../../utils/formatters';

interface LiveSummaryPanelProps {
  customerName: string;
  plotLabel: string;
  finalPrice: number;
  bookingPaid: number;
  downPaymentAmount: number;
  remainingDownPayment: number;
  onPossessionAmount: number;
  onPossessionEnabled: boolean;
  semiAnnualTotal: number;
  semiAnnualEnabled: boolean;
  planSummaryText: string;
  monthlyInstallmentText: string;
  grandTotal: number;
  isExact: boolean;
  difference: number;
  dealerCommissionAmount: number;
  dealerName?: string;
  mode?: 'sale' | 'booking';
}

// Micro animated number display with GSAP count-up
const AnimatedCurrency: React.FC<{ value: number; className?: string }> = ({
  value,
  className = '',
}) => {
  const elRef = useRef<HTMLSpanElement>(null);
  const prevValRef = useRef<number>(value);

  useEffect(() => {
    const target = elRef.current;
    if (!target) return;
    const obj = { val: prevValRef.current };
    gsap.to(obj, {
      val: value,
      duration: 0.4,
      ease: 'power2.out',
      onUpdate: () => {
        if (target) {
          target.innerText = formatCurrency(Math.round(obj.val));
        }
      },
    });
    prevValRef.current = value;
  }, [value]);

  return (
    <span ref={elRef} className={className}>
      {formatCurrency(value)}
    </span>
  );
};

export const LiveSummaryPanel: React.FC<LiveSummaryPanelProps> = ({
  customerName,
  plotLabel,
  finalPrice,
  bookingPaid,
  downPaymentAmount,
  remainingDownPayment,
  onPossessionAmount,
  onPossessionEnabled,
  semiAnnualTotal,
  semiAnnualEnabled,
  planSummaryText,
  monthlyInstallmentText,
  grandTotal,
  isExact,
  difference,
  dealerCommissionAmount,
  dealerName,
  mode = 'sale',
}) => {
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const calculatedSum =
    downPaymentAmount +
    (onPossessionEnabled ? onPossessionAmount : 0) +
    (mode === 'sale' ? grandTotal + (semiAnnualEnabled ? semiAnnualTotal : 0) : 0);

  const exactCheck = isExact && finalPrice > 0;

  return (
    <>
      {/* Desktop Sticky Panel */}
      <div className="hidden lg:block w-80 sticky top-20 self-start bg-white rounded-2xl border border-slate-200/90 shadow-md p-5 space-y-4">
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
            <AnimatedCurrency
              value={finalPrice}
              className="font-extrabold text-sm text-[#1a3c6e]"
            />
          </div>

          <div className="flex justify-between items-center text-slate-600">
            <span>Down Payment:</span>
            <AnimatedCurrency value={downPaymentAmount} className="font-semibold" />
          </div>

          {bookingPaid > 0 && (
            <div className="flex justify-between items-center text-emerald-700">
              <span>Booking Paid:</span>
              <span>− {formatCurrency(bookingPaid)}</span>
            </div>
          )}

          <div className="flex justify-between items-center text-slate-800 font-bold pt-1 border-t border-slate-200/70">
            <span>Remaining DP:</span>
            <AnimatedCurrency value={remainingDownPayment} />
          </div>

          {onPossessionEnabled && (
            <div className="flex justify-between items-center text-slate-600">
              <span>On Possession:</span>
              <AnimatedCurrency value={onPossessionAmount} className="font-semibold" />
            </div>
          )}

          {mode === 'sale' && semiAnnualEnabled && (
            <div className="flex justify-between items-center text-slate-600">
              <span>Semi-Annual Total:</span>
              <AnimatedCurrency value={semiAnnualTotal} className="font-semibold" />
            </div>
          )}
        </div>

        {/* Plan Details (for sale) */}
        {mode === 'sale' && (
          <div className="space-y-1.5 text-xs pt-1">
            <div className="flex justify-between text-slate-500">
              <span>Plan:</span>
              <span className="font-medium text-slate-800">{planSummaryText || '—'}</span>
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
      </div>

      {/* Mobile Collapsible Bottom Sheet */}
      <div className="lg:hidden fixed bottom-16 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-xl px-4 py-2.5">
        <button
          type="button"
          onClick={() => setMobileExpanded(!mobileExpanded)}
          className="w-full flex items-center justify-between text-xs font-bold text-slate-800"
        >
          <div className="flex items-center gap-2">
            <span className="text-[#1a3c6e]">Final Price:</span>
            <span className="text-sm font-extrabold text-[#1a3c6e]">
              {formatCurrency(finalPrice)}
            </span>
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <span>Summary</span>
            {mobileExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </div>
        </button>

        {mobileExpanded && (
          <div className="pt-3 pb-2 space-y-2 text-xs text-slate-600 border-t border-slate-100 mt-2 max-h-60 overflow-y-auto">
            <div className="flex justify-between">
              <span>Customer:</span>
              <span className="font-semibold text-slate-800">{customerName || 'None'}</span>
            </div>
            <div className="flex justify-between">
              <span>Plot:</span>
              <span className="font-semibold text-[#1a3c6e]">{plotLabel || 'None'}</span>
            </div>
            <div className="flex justify-between">
              <span>Down Payment:</span>
              <span>{formatCurrency(downPaymentAmount)}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-800">
              <span>Remaining DP:</span>
              <span>{formatCurrency(remainingDownPayment)}</span>
            </div>
            {onPossessionEnabled && (
              <div className="flex justify-between">
                <span>On Possession:</span>
                <span>{formatCurrency(onPossessionAmount)}</span>
              </div>
            )}
            {mode === 'sale' && (
              <div className="flex justify-between">
                <span>Plan:</span>
                <span>{planSummaryText}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default LiveSummaryPanel;
