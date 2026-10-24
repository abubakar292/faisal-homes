import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { Printer, FileText, Calendar, ArrowRight, PlusCircle, Check, Map } from 'lucide-react';
import BrandLoader from '../brand/BrandLoader';

interface SavingOverlayProps {
  isSaving: boolean;
  savingStage: string;
  isSuccess: boolean;
  successResult: {
    customerId: string;
    plotId: string;
    bookingId?: string;
    saleId?: string;
    receiptNumber?: string;
  } | null;
  isBookingOnly: boolean;
  onPrintBookingReceipt?: () => void;
  onPrintAgreement?: () => void;
  onPrintSchedule?: () => void;
  onOpenCustomerLedger?: () => void;
  onReceiveFirstPayment?: () => void;
  onContinueToCompleteSale?: () => void;
  onNewSale: () => void;
}

export const SavingOverlay: React.FC<SavingOverlayProps> = ({
  isSaving,
  savingStage,
  isSuccess,
  successResult,
  isBookingOnly,
  onPrintBookingReceipt,
  onPrintAgreement,
  onPrintSchedule,
  onOpenCustomerLedger,
  onReceiveFirstPayment,
  onContinueToCompleteSale,
  onNewSale,
}) => {
  const navigate = useNavigate();
  const checkSvgRef = useRef<SVGSVGElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Beforeunload guard while saving
  useEffect(() => {
    if (!isSaving) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSaving]);

  // GSAP animation for success checkmark
  useEffect(() => {
    if (!isSuccess || !checkSvgRef.current) return;
    const path = checkSvgRef.current.querySelector('path');
    const circle = checkSvgRef.current.querySelector('circle');

    if (cardRef.current) {
      gsap.fromTo(
        cardRef.current,
        { scale: 0.9, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.4)' }
      );
    }

    if (circle) {
      gsap.fromTo(
        circle,
        { strokeDashoffset: 200, strokeDasharray: 200 },
        { strokeDashoffset: 0, duration: 0.6, ease: 'power2.out' }
      );
    }

    if (path) {
      gsap.fromTo(
        path,
        { strokeDashoffset: 60, strokeDasharray: 60 },
        { strokeDashoffset: 0, duration: 0.5, delay: 0.35, ease: 'power2.out' }
      );
    }
  }, [isSuccess]);

  if (!isSaving && !isSuccess) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
      style={{ background: 'rgba(15, 23, 42, 0.78)' }}
      role="dialog"
      aria-modal="true"
    >
      {/* 1. Saving State Overlay */}
      {isSaving && (
        <div className="flex flex-col items-center justify-center space-y-6 text-center select-none">
          <div className="p-6 rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl flex items-center justify-center">
            <BrandLoader size={96} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-extrabold text-white tracking-wide">
              Processing Transaction
            </h3>
            <p className="text-sm font-semibold tracking-wider text-[#e7b861] uppercase animate-pulse">
              {savingStage || 'Submitting...'}
            </p>
            <p className="text-xs text-white/60">
              Please do not close or refresh this tab
            </p>
          </div>
        </div>
      )}

      {/* 2. Success State Card */}
      {isSuccess && (
        <div
          ref={cardRef}
          className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 text-center space-y-5"
        >
          {/* Animated Gold Checkmark */}
          <div className="flex justify-center">
            <svg
              ref={checkSvgRef}
              className="w-20 h-20"
              viewBox="0 0 52 52"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="26"
                cy="26"
                r="24"
                stroke="#e7b861"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <path
                d="M16 27 L23 34 L36 19"
                stroke="#1a3c6e"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-xl font-extrabold text-slate-800">
              {isBookingOnly ? 'Booking Confirmed!' : 'Sale Successfully Completed!'}
            </h3>
            <p className="text-xs text-slate-500 font-mono">
              Receipt / Sale #: <strong className="text-[#1a3c6e]">{successResult?.receiptNumber || '—'}</strong>
            </p>
          </div>

          {/* Action buttons on success */}
          <div className="space-y-2.5 pt-2">
            {isBookingOnly ? (
              <>
                {onPrintBookingReceipt && (
                  <button
                    type="button"
                    onClick={onPrintBookingReceipt}
                    className="btn btn-primary w-full py-2.5 flex items-center justify-center gap-2"
                  >
                    <Printer size={16} /> Print Booking Receipt
                  </button>
                )}
                {onContinueToCompleteSale && (
                  <button
                    type="button"
                    onClick={onContinueToCompleteSale}
                    className="btn btn-secondary w-full py-2.5 flex items-center justify-center gap-2"
                  >
                    <ArrowRight size={16} /> Complete the Sale Now
                  </button>
                )}
              </>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {onPrintAgreement && (
                  <button
                    type="button"
                    onClick={onPrintAgreement}
                    className="btn btn-primary py-2.5 flex items-center justify-center gap-1.5"
                  >
                    <FileText size={15} /> Print Agreement
                  </button>
                )}
                {onPrintSchedule && (
                  <button
                    type="button"
                    onClick={onPrintSchedule}
                    className="btn btn-secondary py-2.5 flex items-center justify-center gap-1.5"
                  >
                    <Calendar size={15} /> Print Schedule
                  </button>
                )}
                {onPrintBookingReceipt && (
                  <button
                    type="button"
                    onClick={onPrintBookingReceipt}
                    className="btn btn-secondary py-2.5 flex items-center justify-center gap-1.5"
                  >
                    <Printer size={15} /> Print Booking Receipt
                  </button>
                )}
                {onOpenCustomerLedger && (
                  <button
                    type="button"
                    onClick={onOpenCustomerLedger}
                    className="btn btn-secondary py-2.5 flex items-center justify-center gap-1.5"
                  >
                    Customer Ledger
                  </button>
                )}
                {onReceiveFirstPayment && (
                  <button
                    type="button"
                    onClick={onReceiveFirstPayment}
                    className="btn btn-secondary py-2.5 flex items-center justify-center gap-1.5 sm:col-span-2"
                  >
                    Receive First Payment
                  </button>
                )}
                {successResult?.plotId && (
                  <button
                    type="button"
                    onClick={() => navigate(`/plots/map?focus=${successResult.plotId}&celebrate=1`)}
                    className="btn bg-[#1a3c6e] text-white hover:bg-[#142f56] py-2.5 flex items-center justify-center gap-1.5 sm:col-span-2 shadow-sm font-semibold"
                  >
                    <Map size={15} /> View on Plot Map
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={onNewSale}
              className="w-full text-xs font-semibold text-slate-500 hover:text-slate-800 py-2 transition-colors flex items-center justify-center gap-1"
            >
              <PlusCircle size={14} /> Start Another New Sale
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SavingOverlay;
