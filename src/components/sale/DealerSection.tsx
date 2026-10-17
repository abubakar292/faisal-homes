import React from 'react';
import { Handshake, UserCheck, UserPlus, X, AlertCircle } from 'lucide-react';
import SearchableSelect from '../ui/SearchableSelect';
import FormField from '../ui/FormField';
import DealerFormFields from '../forms/DealerFormFields';
import { formatCurrency } from '../../utils/formatters';
import type { Dealer } from '../../types';
import type { DealerFormData } from '../../utils/dealerForm';

interface DealerSectionProps {
  dealerMode: 'none' | 'existing' | 'new';
  setDealerMode: (mode: 'none' | 'existing' | 'new') => void;
  dealers: Dealer[];
  selectedDealerId: string;
  onSelectDealerId: (id: string) => void;
  newDealer: DealerFormData;
  onNewDealerChange: (key: keyof DealerFormData, val: string | number) => void;
  commissionPercent: number | string;
  onCommissionPercentChange: (pct: number | string) => void;
  commissionAmount: number;
  commissionStatus: 'paid' | 'pending';
  setCommissionStatus: (status: 'paid' | 'pending') => void;
  finalPrice: number;
  errors: Record<string, string>;
}

export const DealerSection: React.FC<DealerSectionProps> = ({
  dealerMode,
  setDealerMode,
  dealers,
  selectedDealerId,
  onSelectDealerId,
  newDealer,
  onNewDealerChange,
  commissionPercent,
  onCommissionPercentChange,
  commissionAmount,
  commissionStatus,
  setCommissionStatus,
  finalPrice,
  errors,
}) => {
  const selectedDealer = dealers.find(d => d.id === selectedDealerId);

  return (
    <div className="space-y-5">
      {/* Dealer Selection Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Dealer & Commission Assignment
          </h3>
          <p className="text-xs text-slate-500">
            Select an authorized dealer or register a new dealer to accrue commission
          </p>
        </div>

        <div className="flex p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setDealerMode('existing')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              dealerMode === 'existing'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCheck size={14} className="text-[#1a3c6e]" /> Select Dealer
          </button>
          <button
            type="button"
            onClick={() => setDealerMode('new')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              dealerMode === 'new'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserPlus size={14} className="text-[#1a3c6e]" /> + Add New Dealer
          </button>
          <button
            type="button"
            onClick={() => setDealerMode('none')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              dealerMode === 'none'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <X size={14} /> Direct (No Dealer)
          </button>
        </div>
      </div>

      {/* Mode: Existing Dealer */}
      {dealerMode === 'existing' && (
        <div className="space-y-4">
          <div>
            <label className="label text-slate-800 font-bold">
              Select Authorized Dealer <span className="text-red-500">*</span>
            </label>
            <SearchableSelect
              value={selectedDealerId}
              onChange={onSelectDealerId}
              options={dealers.map(d => ({
                value: d.id,
                label: d.name,
                sublabel: `${d.phone} · CNIC: ${d.cnic} · Default Rate: ${d.commissionRate || 1}%`,
              }))}
              placeholder="Search registered dealers by name or phone..."
              error={!!errors.dealerId}
            />
            {errors.dealerId && (
              <p className="text-xs text-red-500 font-medium mt-1">
                {errors.dealerId}
              </p>
            )}
          </div>

          {selectedDealer ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2">
              <div className="flex items-center justify-between font-bold text-sm">
                <span className="text-slate-900 font-bold text-base">{selectedDealer.name}</span>
                <span className="text-[#1a3c6e] font-mono">{selectedDealer.phone}</span>
              </div>
              <div className="flex gap-4 text-slate-600">
                <span>CNIC: <strong>{selectedDealer.cnic}</strong></span>
                <span>Default Rate: <strong>{selectedDealer.commissionRate || 1}%</strong></span>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-800">
              Please choose a dealer from the dropdown above to calculate their commission.
            </div>
          )}
        </div>
      )}

      {/* Mode: New Dealer */}
      {dealerMode === 'new' && (
        <div className="space-y-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
            <UserPlus size={16} className="text-[#1a3c6e]" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Register New Dealer Details
            </span>
          </div>
          <DealerFormFields
            form={newDealer}
            onChange={onNewDealerChange}
            errors={errors}
            collapsibleOptional={false}
          />
        </div>
      )}

      {/* Mode: None (Direct Sale) */}
      {dealerMode === 'none' && (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
          <AlertCircle size={18} className="text-slate-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-slate-600">
            <strong className="text-slate-800 block text-sm mb-0.5">Direct Sale (No Dealer Assigned)</strong>
            No dealer commission will be recorded or disbursed for this transaction. If an authorized dealer assisted with this sale, click <strong>"Select Dealer"</strong> or <strong>"+ Add New Dealer"</strong> above.
          </div>
        </div>
      )}

      {/* Commission settings (visible if dealer is assigned) */}
      {dealerMode !== 'none' && (
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm space-y-4 pt-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5 pb-2 border-b border-slate-100">
            <Handshake size={15} className="text-[#1a3c6e]" /> Commission Rate & Settlement
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField
              label="Commission %"
              hint="Percentage of final price"
              error={errors.dealerCommissionPercent}
            >
              <div className="relative">
                <input
                  type="number"
                  className="input-field pr-8 font-semibold text-slate-900"
                  value={commissionPercent}
                  onChange={e => onCommissionPercentChange(e.target.value)}
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="2"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">
                  %
                </span>
              </div>
            </FormField>

            <FormField label="Calculated Commission">
              <input
                type="text"
                readOnly
                className="input-field bg-slate-100 font-bold text-[#1a3c6e]"
                value={formatCurrency(commissionAmount)}
              />
            </FormField>

            <FormField label="Payment Status">
              <select
                className="input-field font-semibold text-slate-900"
                value={commissionStatus}
                onChange={e => setCommissionStatus(e.target.value as 'paid' | 'pending')}
              >
                <option value="pending">Pending (Pay later via Dealer Ledger)</option>
                <option value="paid">Paid immediately</option>
              </select>
            </FormField>
          </div>

          {commissionAmount > 0 && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium">
              Dealer will earn <strong>{formatCurrency(commissionAmount)}</strong> ({commissionPercent}% of final price {formatCurrency(finalPrice)}).
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DealerSection;
