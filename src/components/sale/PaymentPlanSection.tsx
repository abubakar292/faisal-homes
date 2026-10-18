import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle,
  ClipboardList,
  Scale,
  BookmarkPlus,
  ExternalLink,
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import {
  INTERVAL_FREQUENCY,
  getRowInterval,
  getRowCount,
  isRowMisaligned,
} from '../../utils/saleCalc';
import type { PaymentPlan, InstallmentRow } from '../../types';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const INTERVAL_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Month (Monthly)' },
  { value: 3, label: '3 Months (Quarterly)' },
  { value: 6, label: '6 Months (Semi-Annual)' },
  { value: 12, label: '12 Months (Annual)' },
];

interface PaymentPlanSectionProps {
  paymentPlans: PaymentPlan[];
  paymentPlanId: string;
  paymentPlanName: string;
  planIsAuto: boolean;
  onSelectPlan: (id: string) => void;
  rows: InstallmentRow[];
  onUpdateRow: (
    id: string,
    field: 'months' | 'intervalMonths' | 'monthlyAmount' | 'totalAmount',
    value: number
  ) => void;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onBalanceLastRow: () => void;
  remainingForInstallments: number;
  remainingToAllocate: number;
  grandTotal: number;
  semiAnnualTotal: number;
  isExact: boolean;
  isRounding: boolean;
  isMismatch: boolean;
  planValid: boolean;
  downPaymentPercent: number;
  onSaveTemplate: (name: string) => Promise<void>;
  errors: Record<string, string>;
}

export const PaymentPlanSection: React.FC<PaymentPlanSectionProps> = ({
  paymentPlans,
  paymentPlanId,
  paymentPlanName,
  planIsAuto,
  onSelectPlan,
  rows,
  onUpdateRow,
  onAddRow,
  onRemoveRow,
  onBalanceLastRow,
  remainingForInstallments,
  remainingToAllocate,
  grandTotal,
  semiAnnualTotal,
  isExact,
  isRounding,
  isMismatch,
  planValid,
  onSaveTemplate,
  errors,
}) => {
  const { isMd } = useBreakpoint();
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const canSaveTemplate = rows.length === 1 && rows[0].months > 0 && getRowCount(rows[0]) > 0;
  const allMonthly = rows.every(r => getRowInterval(r) === 1);
  const totalMonths = rows.reduce((s, r) => s + (r.months || 0), 0);

  const handleConfirmSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim()) return;
    try {
      setSavingTemplate(true);
      await onSaveTemplate(templateName.trim());
      setShowTemplateModal(false);
      setTemplateName('');
    } finally {
      setSavingTemplate(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Plan template selector bar */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="payment-plan-select"
            className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5"
          >
            <ClipboardList size={14} className="text-[#1a3c6e]" /> Select Payment Plan Template
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!canSaveTemplate}
              onClick={() => setShowTemplateModal(true)}
              title={
                canSaveTemplate
                  ? 'Save current repeating row as a new reusable plan template'
                  : 'Template saving requires a single repeating installment row'
              }
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#1a3c6e] hover:underline disabled:opacity-40 disabled:no-underline"
            >
              <BookmarkPlus size={13} /> Save as template
            </button>
            <Link
              to="/payment-plans/list"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline"
            >
              Manage templates <ExternalLink size={11} />
            </Link>
          </div>
        </div>

        <select
          id="payment-plan-select"
          className="input-field bg-white"
          value={paymentPlanId}
          onChange={e => onSelectPlan(e.target.value)}
        >
          <option value="">Custom (no plan)</option>
          {paymentPlans.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.duration} {p.durationUnit}, {p.installmentType}, {p.numberOfInstallments} installments, {p.downPaymentPercent}% down
            </option>
          ))}
        </select>

        {paymentPlanId && (
          <div className="flex items-center justify-between gap-2 flex-wrap text-xs pt-1">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-semibold ${
                planIsAuto
                  ? 'bg-indigo-50 text-[#1a3c6e] border border-indigo-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}
            >
              <CheckCircle size={12} />
              Active Plan: {paymentPlanName} {planIsAuto ? '(Auto-calculated)' : '(Customized)'}
            </span>
            <span className="text-slate-400 text-[11px]">
              Total Duration: {totalMonths} Months
            </span>
          </div>
        )}
      </div>

      {errors.rows && (
        <p className="text-xs text-red-500 font-medium flex items-center gap-1 bg-red-50 p-2.5 rounded-lg border border-red-200">
          <AlertTriangle size={13} /> {errors.rows}
        </p>
      )}

      {/* Rows Editor */}
      <div className="space-y-3">
        {/* Sticky Remaining Allocation Indicator */}
        <div className="sticky top-24 sm:top-28 z-10 bg-white/95 backdrop-blur-md p-3 rounded-xl border border-slate-200/90 shadow-sm flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">To Allocate:</span>
            <span className={`font-bold ${isExact ? 'text-emerald-700' : 'text-amber-700'}`}>
              {formatCurrency(isExact ? 0 : remainingToAllocate)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {isExact ? (
              <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px]">
                <CheckCircle size={14} /> Balanced
              </span>
            ) : (
              <span className="text-amber-700 font-bold flex items-center gap-1 text-[11px]">
                <AlertTriangle size={14} /> Unbalanced
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Installment Schedule Rows
          </h4>
          <button
            type="button"
            onClick={onAddRow}
            className="btn btn-secondary text-xs w-full sm:w-auto justify-center min-h-[44px] sm:min-h-0"
          >
            <Plus size={14} /> Add Row
          </button>
        </div>

        {/* Rows Editor: Stacked cards on phones (< md), 12-col table from md */}
        {!isMd ? (
          <div className="space-y-3">
            {rows.map((row, idx) => {
              const interval = getRowInterval(row);
              const count = getRowCount(row);
              const misaligned = isRowMisaligned(row);

              return (
                <div
                  key={row.id}
                  className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3 relative"
                >
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-700">
                      Row #{idx + 1}
                      <span className="text-slate-400 font-normal ml-1">
                        ({count} {count === 1 ? 'installment' : 'installments'})
                      </span>
                    </span>
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemoveRow(row.id)}
                        aria-label={`Remove row ${idx + 1}`}
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                        Months
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        className={`input-field min-h-[44px] text-center ${misaligned ? 'input-error' : ''}`}
                        value={row.months || ''}
                        onChange={e => onUpdateRow(row.id, 'months', Number(e.target.value))}
                        placeholder="12"
                        min="1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                        Frequency
                      </label>
                      <select
                        className="input-field min-h-[44px] text-xs"
                        value={interval}
                        onChange={e => onUpdateRow(row.id, 'intervalMonths', Number(e.target.value))}
                      >
                        {INTERVAL_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                        {interval === 1 ? 'Per month' : 'Amount / Inst'}
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        className="input-field min-h-[44px]"
                        value={row.monthlyAmount || ''}
                        onChange={e => onUpdateRow(row.id, 'monthlyAmount', Number(e.target.value))}
                        placeholder="e.g. 50000"
                        min="0"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                        Row Total
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        className="input-field min-h-[44px] font-semibold text-[#1a3c6e]"
                        value={row.totalAmount || ''}
                        onChange={e => onUpdateRow(row.id, 'totalAmount', Number(e.target.value))}
                        min="0"
                      />
                    </div>
                  </div>

                  {misaligned && (
                    <p className="text-xs text-rose-600 font-medium flex items-center gap-1 pt-1">
                      <AlertTriangle size={12} /> Months must be a multiple of {interval}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto pb-1">
            <div className="min-w-[480px] space-y-2">
              <div className="grid grid-cols-12 gap-2 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <div className="col-span-2">Months</div>
                <div className="col-span-3">Frequency</div>
                <div className="col-span-3">
                  {allMonthly ? 'Monthly Amount' : 'Amount / Installment'}
                </div>
                <div className="col-span-3">Row Total</div>
                <div className="col-span-1" />
              </div>

              <div className="space-y-2">
                {rows.map((row, idx) => {
                  const interval = getRowInterval(row);
                  const count = getRowCount(row);
                  const misaligned = isRowMisaligned(row);

                  return (
                    <div key={row.id} className="space-y-1">
                      <div className="grid grid-cols-12 gap-2 items-start">
                        <div className="col-span-2">
                          <input
                            type="number"
                            inputMode="numeric"
                            className={`input-field text-center ${misaligned ? 'input-error' : ''}`}
                            value={row.months || ''}
                            onChange={e => onUpdateRow(row.id, 'months', Number(e.target.value))}
                            placeholder="12"
                            min="1"
                          />
                        </div>
                        <div className="col-span-3">
                          <select
                            className="input-field text-xs"
                            value={interval}
                            onChange={e => onUpdateRow(row.id, 'intervalMonths', Number(e.target.value))}
                          >
                            {INTERVAL_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <p className="text-[10px] text-slate-500 mt-0.5 pl-1">
                            = {count} {count === 1 ? 'installment' : 'installments'}
                          </p>
                        </div>
                        <div className="col-span-3">
                          <input
                            type="number"
                            inputMode="numeric"
                            className="input-field"
                            value={row.monthlyAmount || ''}
                            onChange={e => onUpdateRow(row.id, 'monthlyAmount', Number(e.target.value))}
                            placeholder="e.g., 50000"
                            min="0"
                          />
                          <p className="text-[10px] text-slate-500 mt-0.5 pl-1">
                            {interval === 1 ? 'Per month' : `Every ${interval}m`}
                          </p>
                        </div>
                        <div className="col-span-3">
                          <input
                            type="number"
                            inputMode="numeric"
                            className="input-field font-semibold text-[#1a3c6e]"
                            value={row.totalAmount || ''}
                            onChange={e => onUpdateRow(row.id, 'totalAmount', Number(e.target.value))}
                            min="0"
                          />
                        </div>
                        <div className="col-span-1 flex justify-center pt-1.5">
                          {rows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => onRemoveRow(row.id)}
                              className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Remove row"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </div>

                      {misaligned && (
                        <p className="text-xs text-rose-600 font-medium flex items-center gap-1 pl-1">
                          <AlertTriangle size={12} /> Months must be a multiple of {interval}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Grand Total & Allocation Check Box */}
      <div
        className={`rounded-2xl p-4 border-2 transition-all ${
          planValid && remainingForInstallments > 0
            ? 'border-emerald-300 bg-emerald-50/50'
            : 'border-amber-300 bg-amber-50/50'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <span>Installments Total: <strong className="text-slate-900">{formatCurrency(grandTotal)}</strong></span>
              {semiAnnualTotal > 0 && (
                <span className="text-slate-600">
                  + Semi-Annual: <strong className="text-slate-900">{formatCurrency(semiAnnualTotal)}</strong>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Required for Plan: <strong className="text-slate-900">{formatCurrency(remainingForInstallments)}</strong>
            </p>
            <p
              className={`text-xs font-bold mt-1 ${
                isExact ? 'text-emerald-700' : isRounding ? 'text-amber-700' : 'text-rose-700'
              }`}
            >
              Remaining to allocate:{' '}
              {formatCurrency(isExact ? 0 : remainingToAllocate)}
            </p>
          </div>

          <div className="sm:text-right">
            <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold block">
              Grand Total
            </span>
            <span
              className={`text-2xl font-extrabold ${
                planValid ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {formatCurrency(grandTotal + semiAnnualTotal)}
            </span>
          </div>
        </div>

        {remainingForInstallments > 0 && !isExact && (
          <div
            className={`mt-3 pt-3 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-2 text-xs font-medium ${
              isMismatch ? 'text-rose-700' : 'text-amber-700'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={14} />
              {isRounding
                ? `${formatCurrency(Math.abs(remainingToAllocate))} rounding difference (absorbed by last installment).`
                : `Difference of ${formatCurrency(Math.abs(remainingToAllocate))}. Please balance rows.`}
            </div>
            <button
              type="button"
              onClick={onBalanceLastRow}
              className="btn btn-secondary text-xs w-full sm:w-auto justify-center min-h-[44px] sm:min-h-0"
              style={{ padding: '6px 14px', fontSize: '11px' }}
            >
              <Scale size={13} /> Balance Last Row
            </button>
          </div>
        )}

        {remainingForInstallments > 0 && isExact && (
          <div className="mt-2 text-xs font-medium text-emerald-700 flex items-center gap-1.5">
            <CheckCircle size={14} /> Exact balance matched
          </div>
        )}
      </div>

      {/* Save Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-800">
              Save Plan Template
            </h3>
            <p className="text-xs text-slate-500">
              Save current settings as a reusable template for future plot sales.
            </p>
            <form onSubmit={handleConfirmSaveTemplate} className="space-y-4">
              <div>
                <label className="label">Template Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  className="input-field"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  placeholder="e.g., 3-Year Standard Monthly"
                />
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border text-xs text-slate-600 space-y-1">
                <div>Duration: <strong>{rows[0]?.months} months</strong></div>
                <div>Frequency: <strong>{INTERVAL_FREQUENCY[getRowInterval(rows[0])] || 'Monthly'}</strong></div>
                <div>Installments: <strong>{getRowCount(rows[0])}</strong></div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingTemplate || !templateName.trim()}
                  className="btn btn-primary"
                >
                  {savingTemplate ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentPlanSection;
