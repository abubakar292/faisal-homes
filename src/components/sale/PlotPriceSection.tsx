import React from 'react';
import SearchableSelect from '../ui/SearchableSelect';
import FormField from '../ui/FormField';
import { formatCurrency } from '../../utils/formatters';
import type { Plot, PaymentMethod } from '../../types';

interface PlotPriceSectionProps {
  plots: Plot[];
  selectedPlotId: string;
  onSelectPlotId: (id: string) => void;
  perMarlaRate: number | string;
  onPerMarlaRateChange: (rate: number | string) => void;
  totalPrice: number | string;
  onTotalPriceChange: (price: number | string) => void;
  discount: number | string;
  onDiscountChange: (discount: number | string) => void;
  finalPrice: number;
  downPaymentPercent: number | string;
  onDownPaymentPercentChange: (pct: number | string) => void;
  downPaymentAmount: number | string;
  onDownPaymentAmountChange: (amt: number | string) => void;
  remainingDownPayment: number;
  bookingPaid: number;
  // Booking fields
  bookingAmount: number | string;
  onBookingAmountChange: (amt: number | string) => void;
  bookingDate: string;
  onBookingDateChange: (date: string) => void;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  bankName: string;
  onBankNameChange: (val: string) => void;
  chequeNumber: string;
  onChequeNumberChange: (val: string) => void;
  referenceNumber: string;
  onReferenceNumberChange: (val: string) => void;
  bookingNotes: string;
  onBookingNotesChange: (val: string) => void;
  bookingReceiptNumber: string;
  isBookingLocked?: boolean;
  // Options
  onPossessionEnabled: boolean;
  setOnPossessionEnabled: (val: boolean) => void;
  onPossessionAmount: number | string;
  setOnPossessionAmount: (val: number | string) => void;
  onPossessionDate: string;
  setOnPossessionDate: (val: string) => void;
  onPossessionNotes: string;
  setOnPossessionNotes: (val: string) => void;
  semiAnnualEnabled: boolean;
  setSemiAnnualEnabled: (val: boolean) => void;
  semiAnnualAmount: number | string;
  setSemiAnnualAmount: (val: number | string) => void;
  errors: Record<string, string>;
  isPlotLocked?: boolean;
}

export const PlotPriceSection: React.FC<PlotPriceSectionProps> = ({
  plots,
  selectedPlotId,
  onSelectPlotId,
  perMarlaRate,
  onPerMarlaRateChange,
  totalPrice,
  onTotalPriceChange,
  discount,
  onDiscountChange,
  finalPrice,
  downPaymentPercent,
  onDownPaymentPercentChange,
  downPaymentAmount,
  onDownPaymentAmountChange,
  remainingDownPayment,
  bookingPaid: _bookingPaid,
  bookingAmount,
  onBookingAmountChange,
  bookingDate,
  onBookingDateChange,
  paymentMethod,
  onPaymentMethodChange,
  bankName,
  onBankNameChange,
  chequeNumber,
  onChequeNumberChange,
  referenceNumber,
  onReferenceNumberChange,
  bookingNotes,
  onBookingNotesChange,
  bookingReceiptNumber,
  isBookingLocked = false,
  onPossessionEnabled,
  setOnPossessionEnabled,
  onPossessionAmount,
  setOnPossessionAmount,
  onPossessionDate,
  setOnPossessionDate,
  onPossessionNotes,
  setOnPossessionNotes,
  semiAnnualEnabled,
  setSemiAnnualEnabled,
  semiAnnualAmount,
  setSemiAnnualAmount,
  errors,
  isPlotLocked = false,
}) => {
  const selectedPlot = plots.find(p => p.id === selectedPlotId);

  return (
    <div className="space-y-5">
      {/* Plot Selection */}
      <div>
        <label className="label">
          Select Plot <span className="text-red-500">*</span>
        </label>
        <SearchableSelect
          value={selectedPlotId}
          onChange={onSelectPlotId}
          options={plots.map(p => ({
            value: p.id,
            label: `${p.plotNumber} — Block ${p.block}`,
            sublabel: `${p.size} ${p.sizeUnit} · ${p.category} · ${p.status}`,
          }))}
          placeholder="Search available plots by number or block..."
          disabled={isPlotLocked}
          error={!!errors.plotId}
        />
        {errors.plotId && (
          <p className="text-xs text-red-500 font-medium mt-1">
            {errors.plotId}
          </p>
        )}
      </div>

      {/* Plot Info Card */}
      {selectedPlot && (
        <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-[#1a3c6e]">
              Plot #{selectedPlot.plotNumber} · Block {selectedPlot.block}
            </span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-[#1a3c6e] uppercase">
              {selectedPlot.category}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-blue-200/50 text-xs text-blue-900">
            <div>
              <span className="text-blue-500 block text-[10px] uppercase font-bold">Size</span>
              <span className="font-semibold">{selectedPlot.size} {selectedPlot.sizeUnit}</span>
            </div>
            <div>
              <span className="text-blue-500 block text-[10px] uppercase font-bold">Location</span>
              <span>{selectedPlot.location || 'Standard'}</span>
            </div>
            <div>
              <span className="text-blue-500 block text-[10px] uppercase font-bold">Status</span>
              <span className="capitalize">{selectedPlot.status}</span>
            </div>
            <div>
              <span className="text-blue-500 block text-[10px] uppercase font-bold">Description</span>
              <span className="truncate block">{selectedPlot.description || '—'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Pricing Inputs */}
      <div className="space-y-4 pt-2 border-t border-slate-100">
        <h3 className="form-section-header">Pricing Breakdown</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormField
            label="Per Marla Rate (Rs.)"
            error={errors.perMarlaRate}
            hint="Auto-calculates total price"
          >
            <input
              type="number"
              className={`input-field ${errors.perMarlaRate ? 'input-error' : ''}`}
              value={perMarlaRate}
              onChange={e => onPerMarlaRateChange(e.target.value)}
              placeholder="e.g., 500000"
              min="0"
            />
          </FormField>

          <FormField
            label="Total Price (Rs.)"
            required
            error={errors.totalPrice}
            hint="Auto-calculated, editable"
          >
            <input
              type="number"
              className={`input-field font-semibold ${errors.totalPrice ? 'input-error' : ''}`}
              style={{ color: '#1a3c6e' }}
              value={totalPrice}
              onChange={e => onTotalPriceChange(e.target.value)}
              placeholder="Total plot price"
              min="0"
            />
          </FormField>

          <FormField label="Discount (Rs.)">
            <input
              type="number"
              className="input-field"
              value={discount}
              onChange={e => onDiscountChange(e.target.value)}
              placeholder="0"
              min="0"
            />
          </FormField>
        </div>

        {/* Calculation summary bar */}
        {Number(totalPrice) > 0 && (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-slate-400">Total Price: </span>
              <span className="font-semibold text-slate-700">{formatCurrency(Number(totalPrice))}</span>
              {Number(discount) > 0 && (
                <>
                  <span className="text-slate-400 ml-2">− Discount: </span>
                  <span className="font-semibold text-amber-600">− {formatCurrency(Number(discount))}</span>
                </>
              )}
            </div>
            <div>
              <span className="text-slate-500 font-medium">Final Price: </span>
              <span className="font-extrabold text-sm text-[#1a3c6e]">
                {formatCurrency(finalPrice)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Down Payment & Advance Booking Section */}
      <div className="space-y-4 pt-2 border-t border-slate-100">
        <h3 className="form-section-header">Down Payment & Advance Booking</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Down Payment %"
            error={errors.downPaymentPercent}
            hint="Percentage of final price"
          >
            <div className="relative">
              <input
                type="number"
                className={`input-field pr-8 ${errors.downPaymentPercent ? 'input-error' : ''}`}
                value={downPaymentPercent}
                onChange={e => onDownPaymentPercentChange(e.target.value)}
                min="0"
                max="100"
                step="0.1"
                placeholder="20"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">
                %
              </span>
            </div>
          </FormField>

          <FormField
            label="Down Payment Amount (Rs.)"
            required
            error={errors.downPaymentAmount}
            hint="Total down payment agreed"
          >
            <input
              type="number"
              className={`input-field font-semibold ${errors.downPaymentAmount ? 'input-error' : ''}`}
              value={downPaymentAmount}
              onChange={e => onDownPaymentAmountChange(e.target.value)}
              min="0"
              placeholder="e.g., 1000000"
            />
          </FormField>
        </div>

        {/* Advance Booking Payment (Always required) */}
        <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/90 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Advance Booking Payment
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Required advance booking payment credited towards down payment.
              </p>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-xs">
              <span className="text-emerald-800 font-medium text-[11px]">
                {isBookingLocked ? 'Linked Receipt:' : 'Receipt Number:'}
              </span>
              <span className="font-mono font-bold text-emerald-900 bg-emerald-100/80 px-2 py-0.5 rounded text-[11px]">
                {bookingReceiptNumber || 'BK-AUTO'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Booking Amount (Rs.)"
              required
              error={errors.bookingAmount}
              hint="Required (> 0, not more than down payment)"
            >
              <input
                type="number"
                className={`input-field font-semibold ${errors.bookingAmount ? 'input-error' : ''}`}
                value={bookingAmount}
                disabled={isBookingLocked}
                onChange={e => onBookingAmountChange(e.target.value)}
                placeholder="e.g., 100000"
                min="0"
              />
            </FormField>

            <FormField label="Booking Date" required error={errors.bookingDate}>
              <input
                type="date"
                className={`input-field ${errors.bookingDate ? 'input-error' : ''}`}
                value={bookingDate}
                disabled={isBookingLocked}
                onChange={e => onBookingDateChange(e.target.value)}
              />
            </FormField>

            <FormField label="Payment Method">
              <select
                className="input-field"
                value={paymentMethod}
                disabled={isBookingLocked}
                onChange={e => onPaymentMethodChange(e.target.value as PaymentMethod)}
              >
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cheque">Cheque</option>
              </select>
            </FormField>

            {paymentMethod === 'Bank Transfer' && (
              <>
                <FormField label="Bank Name" required error={errors.bankName}>
                  <input
                    type="text"
                    className={`input-field ${errors.bankName ? 'input-error' : ''}`}
                    value={bankName}
                    disabled={isBookingLocked}
                    onChange={e => onBankNameChange(e.target.value)}
                    placeholder="e.g., Meezan Bank, HBL"
                  />
                </FormField>
                <FormField label="Reference Number (Optional)">
                  <input
                    type="text"
                    className="input-field"
                    value={referenceNumber}
                    disabled={isBookingLocked}
                    onChange={e => onReferenceNumberChange(e.target.value)}
                    placeholder="Transaction ID / Slip #"
                  />
                </FormField>
              </>
            )}

            {paymentMethod === 'Cheque' && (
              <>
                <FormField label="Bank Name">
                  <input
                    type="text"
                    className="input-field"
                    value={bankName}
                    disabled={isBookingLocked}
                    onChange={e => onBankNameChange(e.target.value)}
                    placeholder="Issuing bank name"
                  />
                </FormField>
                <FormField label="Cheque Number" required error={errors.chequeNumber}>
                  <input
                    type="text"
                    className={`input-field font-mono ${errors.chequeNumber ? 'input-error' : ''}`}
                    value={chequeNumber}
                    disabled={isBookingLocked}
                    onChange={e => onChequeNumberChange(e.target.value)}
                    placeholder="Cheque #"
                  />
                </FormField>
                <FormField label="Reference Number (Optional)">
                  <input
                    type="text"
                    className="input-field"
                    value={referenceNumber}
                    disabled={isBookingLocked}
                    onChange={e => onReferenceNumberChange(e.target.value)}
                    placeholder="Cheque deposit ref #"
                  />
                </FormField>
              </>
            )}

            <div className="sm:col-span-2">
              <FormField label="Booking Notes">
                <input
                  type="text"
                  className="input-field"
                  value={bookingNotes}
                  disabled={isBookingLocked}
                  onChange={e => onBookingNotesChange(e.target.value)}
                  placeholder="Notes regarding advance booking payment..."
                />
              </FormField>
            </div>
          </div>

          {/* Helper line and calculation */}
          <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-xs space-y-1.5 text-sky-900">
            <div className="text-[11px] font-bold text-sky-800 tracking-wide uppercase">
              Remaining down payment = down payment - booking
            </div>
            <div className="flex justify-between items-center text-slate-700 pt-1 border-t border-sky-200/60">
              <span>Down Payment Amount:</span>
              <span className="font-semibold">{formatCurrency(Number(downPaymentAmount) || 0)}</span>
            </div>
            <div className="flex justify-between items-center text-emerald-700">
              <span>Booking Amount (Credited):</span>
              <span>− {formatCurrency(Number(bookingAmount) || 0)}</span>
            </div>
            <div className="flex justify-between items-center font-bold text-sm text-[#1a3c6e] pt-1 border-t border-sky-200/60">
              <span>Remaining Down Payment:</span>
              <span>{formatCurrency(remainingDownPayment)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* On-Possession Option */}
      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 text-[#1a3c6e] rounded border-slate-300 focus:ring-[#1a3c6e]"
            checked={onPossessionEnabled}
            onChange={e => setOnPossessionEnabled(e.target.checked)}
          />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Include On-Possession Payment
          </span>
        </label>

        {onPossessionEnabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-6 pt-2">
            <FormField label="On-Possession Amount (Rs.)" error={errors.onPossessionAmount}>
              <input
                type="number"
                className="input-field"
                value={onPossessionAmount}
                onChange={e => setOnPossessionAmount(e.target.value)}
                placeholder="e.g., 500000"
                min="0"
              />
            </FormField>

            <FormField label="Estimated Possession Date">
              <input
                type="date"
                className="input-field"
                value={onPossessionDate}
                onChange={e => setOnPossessionDate(e.target.value)}
              />
            </FormField>

            <div className="sm:col-span-2">
              <FormField label="Possession Notes">
                <input
                  type="text"
                  className="input-field"
                  value={onPossessionNotes}
                  onChange={e => setOnPossessionNotes(e.target.value)}
                  placeholder="Notes regarding possession handover..."
                />
              </FormField>
            </div>
          </div>
        )}
      </div>

      {/* Semi-Annual Option */}
      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 text-[#1a3c6e] rounded border-slate-300 focus:ring-[#1a3c6e]"
            checked={semiAnnualEnabled}
            onChange={e => setSemiAnnualEnabled(e.target.checked)}
          />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Enable Semi-Annual Payments (Every 6 Months)
          </span>
        </label>

        {semiAnnualEnabled && (
          <div className="pl-6 pt-1 max-w-sm">
            <FormField
              label="Semi-Annual Amount (Rs.)"
              hint="Extra payment added on months 6, 12, 18..."
              error={errors.semiAnnualAmount}
            >
              <input
                type="number"
                className="input-field"
                value={semiAnnualAmount}
                onChange={e => setSemiAnnualAmount(e.target.value)}
                placeholder="e.g., 100000"
                min="0"
              />
            </FormField>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlotPriceSection;
