import React from 'react';
import { Handshake, UserCheck, UserPlus, X, Check, ShieldCheck } from 'lucide-react';
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
      {/* Section Sub-Header */}
      <div className="pb-2 border-b border-slate-100">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
          <Handshake size={15} className="text-[#1a3c6e]" /> Dealer & Commission Assignment
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Select an authorized dealer, register a new dealer for this sale, or process as a direct sale
        </p>
      </div>

      {/* 3-Card Responsive Option Selector (Grid never overflows) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Card 1: Existing Dealer */}
        <button
          type="button"
          onClick={() => setDealerMode('existing')}
          className={`p-3.5 rounded-xl border text-left transition-all relative ${
            dealerMode === 'existing'
              ? 'border-[#1a3c6e] bg-blue-50/70 shadow-sm ring-1 ring-[#1a3c6e]'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                dealerMode === 'existing'
                  ? 'bg-[#1a3c6e] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              <UserCheck size={15} />
            </div>
            {dealerMode === 'existing' ? (
              <span className="w-2.5 h-2.5 rounded-full bg-[#1a3c6e]" />
            ) : (
              <span className="w-2.5 h-2.5 rounded-full border border-slate-300" />
            )}
          </div>
          <div className={`text-xs font-bold ${dealerMode === 'existing' ? 'text-[#1a3c6e]' : 'text-slate-800'}`}>
            Select Dealer
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Registered agency / dealer
          </div>
        </button>

        {/* Card 2: New Dealer */}
        <button
          type="button"
          onClick={() => setDealerMode('new')}
          className={`p-3.5 rounded-xl border text-left transition-all relative ${
            dealerMode === 'new'
              ? 'border-[#1a3c6e] bg-blue-50/70 shadow-sm ring-1 ring-[#1a3c6e]'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                dealerMode === 'new'
                  ? 'bg-[#1a3c6e] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              <UserPlus size={15} />
            </div>
            {dealerMode === 'new' ? (
              <span className="w-2.5 h-2.5 rounded-full bg-[#1a3c6e]" />
            ) : (
              <span className="w-2.5 h-2.5 rounded-full border border-slate-300" />
            )}
          </div>
          <div className={`text-xs font-bold ${dealerMode === 'new' ? 'text-[#1a3c6e]' : 'text-slate-800'}`}>
            + Add New Dealer
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Register for this sale
          </div>
        </button>

        {/* Card 3: Direct Sale (No Dealer) */}
        <button
          type="button"
          onClick={() => setDealerMode('none')}
          className={`p-3.5 rounded-xl border text-left transition-all relative ${
            dealerMode === 'none'
              ? 'border-emerald-600 bg-emerald-50/70 shadow-sm ring-1 ring-emerald-600'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                dealerMode === 'none'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              <X size={15} />
            </div>
            {dealerMode === 'none' ? (
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
            ) : (
              <span className="w-2.5 h-2.5 rounded-full border border-slate-300" />
            )}
          </div>
          <div className={`text-xs font-bold ${dealerMode === 'none' ? 'text-emerald-900' : 'text-slate-800'}`}>
            Direct (No Dealer)
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Direct sale · 0% commission
          </div>
        </button>
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
          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 mt-0.5">
            <ShieldCheck size={18} />
          </div>
          <div className="text-xs text-slate-600 space-y-1">
            <strong className="text-slate-900 block text-sm">Direct Customer Sale Confirmed</strong>
            <p>
              No dealer commission will be recorded or disbursed for this transaction. If an authorized dealer assisted with this sale, click <strong>"Select Dealer"</strong> or <strong>"+ Add New Dealer"</strong> above to link them.
            </p>
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
              <div className="space-y-1.5">
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
                {/* Quick preset chips */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[1, 1.5, 2, 2.5, 3].map(pct => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => onCommissionPercentChange(pct)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                        Number(commissionPercent) === pct
                          ? 'bg-[#1a3c6e] text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
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
