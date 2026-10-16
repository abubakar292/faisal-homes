import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import FormField from '../ui/FormField';
import { formatCNIC, formatPhone } from '../../utils/formatters';
import type { DealerFormData } from '../../utils/dealerForm';

interface DealerFormFieldsProps {
  form: DealerFormData;
  onChange: (key: keyof DealerFormData, value: string | number) => void;
  errors?: Record<string, string>;
  collapsibleOptional?: boolean;
}

export const DealerFormFields: React.FC<DealerFormFieldsProps> = ({
  form,
  onChange,
  errors = {},
  collapsibleOptional = false,
}) => {
  const [showMore, setShowMore] = useState(!collapsibleOptional);

  const handleTextChange = (key: keyof DealerFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    let val = e.target.value;
    if (key === 'cnic') val = formatCNIC(val).slice(0, 15);
    if (key === 'phone' || key === 'whatsapp') val = formatPhone(val).slice(0, 12);
    onChange(key, val);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Full Name" required error={errors.name}>
          <input
            className={`input-field ${errors.name ? 'input-error' : ''}`}
            value={form.name}
            onChange={handleTextChange('name')}
            placeholder="Dealer full name"
          />
        </FormField>
        <FormField label="CNIC" required error={errors.cnic} hint="XXXXX-XXXXXXX-X">
          <input
            className={`input-field font-mono ${errors.cnic ? 'input-error' : ''}`}
            value={form.cnic}
            onChange={handleTextChange('cnic')}
            placeholder="35202-1234567-1"
          />
        </FormField>
        <FormField label="Phone" required error={errors.phone}>
          <input
            className={`input-field ${errors.phone ? 'input-error' : ''}`}
            value={form.phone}
            onChange={handleTextChange('phone')}
            placeholder="03XX-XXXXXXX"
          />
        </FormField>
        <FormField label="WhatsApp">
          <input
            className="input-field"
            value={form.whatsapp}
            onChange={handleTextChange('whatsapp')}
            placeholder="03XX-XXXXXXX"
          />
        </FormField>
        <FormField label="Email">
          <input
            className="input-field"
            type="email"
            value={form.email}
            onChange={e => onChange('email', e.target.value)}
            placeholder="email@example.com"
          />
        </FormField>
      </div>

      {collapsibleOptional && (
        <button
          type="button"
          onClick={() => setShowMore(!showMore)}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline pt-1"
        >
          {showMore ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showMore ? 'Hide More Details' : 'More Details (Address & Notes)'}
        </button>
      )}

      {showMore && (
        <>
          <FormField label="Address">
            <input
              className="input-field"
              value={form.address}
              onChange={handleTextChange('address')}
              placeholder="Dealer office address"
            />
          </FormField>
          <FormField label="Notes">
            <textarea
              className="input-field h-16 resize-none"
              value={form.notes}
              onChange={handleTextChange('notes')}
              placeholder="Additional notes"
            />
          </FormField>
        </>
      )}
    </div>
  );
};

export default DealerFormFields;
