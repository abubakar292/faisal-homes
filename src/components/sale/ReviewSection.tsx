import React from 'react';
import {
  Check,
  AlertCircle,
  Calendar,
  ArrowRight,
  CheckCircle,
  Bookmark,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import type { Installment } from '../../types';

export interface ValidationItem {
  sectionId: string;
  label: string;
  valid: boolean;
  message?: string;
}

interface ReviewSectionProps {
  customerSummary: {
    name: string;
    cnic: string;
    phone: string;
    address: string;
    nomineeName?: string;
    nomineeRelation?: string;
  };
  plotSummary: {
    number: string;
    block: string;
    size: number;
    sizeUnit: string;
    category: string;
  } | null;
  pricingSummary: {
    totalPrice: number;
    discount: number;
    finalPrice: number;
    downPaymentAmount: number;
    downPaymentPercent: number;
    remainingDownPayment: number;
    onPossessionEnabled: boolean;
    onPossessionAmount: number;
    semiAnnualEnabled: boolean;
    semiAnnualAmount: number;
  };
  bookingSummary: {
    enabled: boolean;
    amount: number;
    date: string;
    method: string;
    receiptNumber: string;
  };
  planSummary: {
    totalMonths: number;
    regularCount: number;
    grandTotal: number;
    remainingForInstallments: number;
    planValid: boolean;
  };
  dealerSummary: {
    mode: 'none' | 'existing' | 'new';
    name: string;
    phone: string;
    commissionPercent: number;
    commissionAmount: number;
    status: string;
  };
  previewInstallments: Omit<Installment, 'id'>[];
  validationChecklist: ValidationItem[];
  onNavigateToSection: (sectionId: string) => void;
  mode?: 'sale' | 'booking';
  onCompleteSale?: () => void;
  onSaveBooking?: () => void;
  isSaving?: boolean;
  savingStage?: string;
}

export const ReviewSection: React.FC<ReviewSectionProps> = ({
  customerSummary,
  plotSummary,
  pricingSummary,
  bookingSummary,
  planSummary,
  dealerSummary,
  previewInstallments,
  validationChecklist,
  onNavigateToSection,
  mode = 'sale',
  onCompleteSale,
  onSaveBooking,
  isSaving = false,
  savingStage = '',
}) => {
  const visiblePreview = previewInstallments.slice(0, 6);
  const remainingCount = Math.max(0, previewInstallments.length - 6);
  const allValid = validationChecklist.every(item => item.valid);

  return (
    <div className="space-y-6">
      {/* Validation Checklist Banner */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Validation Checklist
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {validationChecklist.map(item => (
            <button
              key={item.sectionId}
              type="button"
              onClick={() => onNavigateToSection(item.sectionId)}
              className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-colors ${
                item.valid
                  ? 'bg-emerald-50/60 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50/70 border-rose-200 text-rose-800 hover:bg-rose-100'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                {item.valid ? (
                  <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                    <Check size={11} strokeWidth={3} />
                  </span>
                ) : (
                  <span className="w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center flex-shrink-0">
                    <AlertCircle size={11} strokeWidth={2.5} />
                  </span>
                )}
                <span className="font-semibold truncate">{item.label}</span>
              </div>
              {!item.valid && (
                <span className="text-[11px] font-medium text-rose-600 flex items-center gap-1 flex-shrink-0 ml-2">
                  Fix <ArrowRight size={11} />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {/* Customer & Nominee Card */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
          <div className="flex justify-between items-center border-b pb-2">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
              Customer Details
            </span>
            <span className="text-slate-400 font-medium">
              Registered Customer
            </span>
          </div>
          <div>
            <p className="font-bold text-sm text-slate-900">{customerSummary.name || 'Not specified'}</p>
            <p className="text-slate-500 font-mono">{customerSummary.cnic || '—'} · {customerSummary.phone || '—'}</p>
            <p className="text-slate-500 truncate">{customerSummary.address || '—'}</p>
          </div>
          {customerSummary.nomineeName && (
            <div className="pt-2 border-t text-[11px] text-slate-500">
              <span className="font-semibold text-slate-700">Nominee: </span>
              {customerSummary.nomineeName} ({customerSummary.nomineeRelation || 'Nominee'})
            </div>
          )}
        </div>

        {/* Plot Details Card */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
          <div className="flex justify-between items-center border-b pb-2">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
              Plot Selection
            </span>
            <span className="text-[#1a3c6e] font-semibold">
              {plotSummary?.category || 'Standard'}
            </span>
          </div>
          {plotSummary ? (
            <div>
              <p className="font-bold text-sm text-[#1a3c6e]">
                Plot #{plotSummary.number} · Block {plotSummary.block}
              </p>
              <p className="text-slate-500 font-medium">
                Size: {plotSummary.size} {plotSummary.sizeUnit}
              </p>
            </div>
          ) : (
            <p className="text-rose-600 font-medium">No plot selected</p>
          )}
        </div>

        {/* Pricing & Booking Card */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
          <div className="flex justify-between items-center border-b pb-2">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
              Financial Summary
            </span>
            <span className="font-extrabold text-[#1a3c6e]">
              {formatCurrency(pricingSummary.finalPrice)}
            </span>
          </div>
          <div className="space-y-1 text-slate-600">
            <div className="flex justify-between">
              <span>Total Price:</span>
              <span className="font-semibold">{formatCurrency(pricingSummary.totalPrice)}</span>
            </div>
            {pricingSummary.discount > 0 && (
              <div className="flex justify-between text-amber-600">
                <span>Discount:</span>
                <span>− {formatCurrency(pricingSummary.discount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Down Payment ({pricingSummary.downPaymentPercent}%):</span>
              <span className="font-semibold">{formatCurrency(pricingSummary.downPaymentAmount)}</span>
            </div>
            {bookingSummary.enabled && (
              <div className="flex justify-between text-emerald-700">
                <span>Booking Paid (Receipt {bookingSummary.receiptNumber}):</span>
                <span>− {formatCurrency(bookingSummary.amount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-slate-900 pt-1 border-t">
              <span>Remaining Down Payment:</span>
              <span>{formatCurrency(pricingSummary.remainingDownPayment)}</span>
            </div>
          </div>
        </div>

        {/* Plan & Dealer Card */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
          <div className="flex justify-between items-center border-b pb-2">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
              {mode === 'booking' ? 'Booking Info' : 'Plan & Dealer'}
            </span>
            {mode === 'sale' && (
              <span className="font-semibold text-slate-600">
                {planSummary.totalMonths} Months
              </span>
            )}
          </div>
          {mode === 'sale' ? (
            <div className="space-y-1 text-slate-600">
              <div className="flex justify-between">
                <span>Regular Installments:</span>
                <span>{planSummary.regularCount} installments</span>
              </div>
              {pricingSummary.semiAnnualEnabled && (
                <div className="flex justify-between">
                  <span>Semi-Annual Payments:</span>
                  <span>{formatCurrency(pricingSummary.semiAnnualAmount)} / 6 mo</span>
                </div>
              )}
              {pricingSummary.onPossessionEnabled && (
                <div className="flex justify-between">
                  <span>On Possession:</span>
                  <span>{formatCurrency(pricingSummary.onPossessionAmount)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t">
                <span>Dealer:</span>
                <span className="font-semibold text-slate-800">
                  {dealerSummary.mode === 'none'
                    ? 'No Dealer'
                    : `${dealerSummary.name || 'Assigned'} (${formatCurrency(dealerSummary.commissionAmount)})`}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-1 text-slate-600">
              <div className="flex justify-between">
                <span>Advance Booking:</span>
                <span className="font-semibold">{formatCurrency(bookingSummary.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Payment Method:</span>
                <span>{bookingSummary.method}</span>
              </div>
              <div className="flex justify-between">
                <span>Booking Date:</span>
                <span>{formatDate(bookingSummary.date)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Schedule Preview Table (only for full sale mode) */}
      {mode === 'sale' && previewInstallments.length > 0 && (
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <Calendar size={14} className="text-[#1a3c6e]" /> Generated Installment Schedule Preview
            </h4>
            <span className="text-xs text-slate-500">
              Total {previewInstallments.length} schedule entries
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-semibold">
                  <th className="py-2 px-3">#</th>
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3">Due Date</th>
                  <th className="py-2 px-3 text-right">Amount Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visiblePreview.map((inst, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="py-2 px-3 font-mono text-slate-500">
                      {inst.installmentNumber > 0 ? inst.installmentNumber : '—'}
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-800 capitalize">
                      {inst.type === 'down_payment'
                        ? 'Remaining Down Payment'
                        : inst.type === 'on_possession'
                        ? 'On Possession'
                        : inst.type === 'semi_annual'
                        ? 'Semi-Annual Extra'
                        : 'Regular Installment'}
                    </td>
                    <td className="py-2 px-3 text-slate-600">
                      {formatDate(inst.dueDate)}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-[#1a3c6e]">
                      {formatCurrency(inst.amountDue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {remainingCount > 0 && (
            <p className="text-center text-xs text-slate-400 pt-1">
              ... and {remainingCount} more installments (all generated atomically upon sale submission)
            </p>
          )}
        </div>
      )}

      {/* Review & Finish Action Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-[#1a3c6e] to-slate-900 text-white shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-[#e7b861] animate-pulse" />
              <span className="text-[11px] uppercase font-bold tracking-widest text-[#e7b861]">
                Final Step · Review & Finish
              </span>
            </div>
            <h3 className="text-lg font-bold text-white">
              {mode === 'booking' ? 'Finalize & Confirm Advance Booking' : 'Finalize & Complete Sale'}
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              {allValid
                ? 'All required details are verified. Click below to submit atomically and print paperwork.'
                : 'Please review the highlighted items above before finalizing.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                allValid
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
              }`}
            >
              {allValid ? <ShieldCheck size={15} /> : <AlertCircle size={15} />}
              {allValid ? 'All Validations Passed' : 'Incomplete Sections'}
            </span>
          </div>
        </div>

        <div className="pt-3 border-t border-white/10 flex flex-wrap items-center gap-3">
          {mode === 'sale' ? (
            <>
              <button
                type="button"
                onClick={onCompleteSale}
                disabled={isSaving}
                className="btn text-xs sm:text-sm font-bold px-6 py-3 bg-[#e7b861] hover:bg-[#d6a54d] text-slate-900 rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {savingStage || 'Completing Sale...'}
                  </>
                ) : (
                  <>
                    <CheckCircle size={16} /> Confirm & Complete Sale
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onSaveBooking}
                disabled={isSaving}
                className="btn text-xs sm:text-sm font-semibold px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Bookmark size={15} /> Save as Booking Only
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onSaveBooking}
              disabled={isSaving}
              className="btn text-xs sm:text-sm font-bold px-6 py-3 bg-[#e7b861] hover:bg-[#d6a54d] text-slate-900 rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {savingStage || 'Saving Booking...'}
                </>
              ) : (
                <>
                  <CheckCircle size={16} /> Confirm & Save Booking
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReviewSection;
