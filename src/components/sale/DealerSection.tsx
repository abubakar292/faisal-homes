import React from 'react';
import { Handshake, UserCheck, UserPlus, X } from 'lucide-react';
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
      {/* Segmented Control */}
      <div className="flex p-1 bg-slate-100 rounded-xl w-full sm:w-96">
        <button
          type="button"
          onClick={() => setDealerMode('none')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all ${
            dealerMode === 'none'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <X size={14} /> No Dealer
        </button>
        <button
          type="button"
          onClick={() => setDealerMode('existing')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all ${
            dealerMode === 'existing'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <UserCheck size={14} /> Existing
        </button>
        <button
          type="button"
          onClick={() => setDealerMode('new')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all ${
            dealerMode === 'new'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <UserPlus size={14} /> New Dealer
        </button>
      </div>

      {/* Mode: Existing Dealer */}
      {dealerMode === 'existing' && (
        <div className="space-y-4">
          <div>
            <label className="label">
              Select Dealer <span className="text-red-500">*</span>
            </label>
            <SearchableSelect
              value={selectedDealerId}
              onChange={onSelectDealerId}
              options={dealers.map(d => ({
                value: d.id,
                label: d.name,
                sublabel: `${d.phone} · CNIC: ${d.cnic} · ${d.commissionRate || 0}%`,
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

          {selectedDealer && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2">
              <div className="flex items-center justify-between font-bold text-sm">
                <span>{selectedDealer.name}</span>
                <span className="text-[#1a3c6e]">{selectedDealer.phone}</span>
              </div>
              <div className="flex gap-4 text-slate-500">
                <span>CNIC: {selectedDealer.cnic}</span>
                <span>Default Rate: {selectedDealer.commissionRate || 0}%</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mode: New Dealer */}
      {dealerMode === 'new' && (
        <div className="space-y-4">
          <DealerFormFields
            form={newDealer}
            onChange={onNewDealerChange}
            errors={errors}
            collapsibleOptional={true}
          />
        </div>
      )}

      {/* Commission settings (visible if dealer selected or new dealer) */}
      {dealerMode !== 'none' && (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4 pt-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <Handshake size={14} className="text-[#1a3c6e]" /> Commission Override & Status
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
                  className="input-field pr-8"
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
                className="input-field"
                value={commissionStatus}
                onChange={e => setCommissionStatus(e.target.value as 'paid' | 'pending')}
              >
                <option value="pending">Pending</option>
                <option value="paid">Paid immediately</option>
              </select>
            </FormField>
          </div>

          {commissionAmount > 0 && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 font-medium">
              Dealer will earn <strong>{formatCurrency(commissionAmount)}</strong> ({commissionPercent}% of final price {formatCurrency(finalPrice)}).
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DealerSection;
