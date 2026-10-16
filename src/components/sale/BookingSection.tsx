import React from 'react';
import FormField from '../ui/FormField';
import { formatCurrency } from '../../utils/formatters';
import type { PaymentMethod } from '../../types';

interface BookingSectionProps {
  bookingEnabled: boolean;
  setBookingEnabled: (enabled: boolean) => void;
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
  notes: string;
  onNotesChange: (val: string) => void;
  receiptNumber: string;
  isBookingLocked?: boolean;
  errors: Record<string, string>;
}

export const BookingSection: React.FC<BookingSectionProps> = ({
  bookingEnabled,
  setBookingEnabled,
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
  notes,
  onNotesChange,
  receiptNumber,
  isBookingLocked = false,
  errors,
}) => {
  return (
    <div className="space-y-5">
      {/* Toggle: Booking amount received now */}
      <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-slate-800 block cursor-pointer">
            Booking Amount Received Now
          </label>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Credit advance booking payment. Reduces the remaining down payment.
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={bookingEnabled}
            disabled={isBookingLocked}
            onChange={e => setBookingEnabled(e.target.checked)}
          />
          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1a3c6e]"></div>
        </label>
      </div>

      {bookingEnabled && (
        <div className="space-y-4 pt-1">
          {/* Readonly Receipt Number Badge */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
            <span className="text-emerald-800 font-medium">
              {isBookingLocked ? 'Linked Booking Receipt:' : 'Auto-generated Receipt Number:'}
            </span>
            <span className="font-mono font-bold text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded">
              {receiptNumber || 'BK-AUTO'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Booking Amount (Rs.)"
              required
              error={errors.bookingAmount}
              hint="Advance payment towards down payment"
            >
              <input
                type="number"
                className={`input-field font-semibold ${errors.bookingAmount ? 'input-error' : ''}`}
                value={bookingAmount}
                disabled={isBookingLocked}
                onChange={e => onBookingAmountChange(e.target.value)}
                placeholder="e.g., 500000"
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
              </>
            )}

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
          </div>

          <FormField label="Booking Notes">
            <textarea
              className="input-field h-16 resize-none"
              value={notes}
              disabled={isBookingLocked}
              onChange={e => onNotesChange(e.target.value)}
              placeholder="Additional notes for booking..."
            />
          </FormField>
        </div>
      )}
    </div>
  );
};

export default BookingSection;
