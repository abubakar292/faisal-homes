import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import FormField from '../ui/FormField';
import { formatCNIC, formatPhone } from '../../utils/formatters';
import type { CustomerFormData } from '../../utils/customerForm';

interface CustomerFormFieldsProps {
  form: CustomerFormData;
  onChange: (key: keyof CustomerFormData, value: string) => void;
  errors?: Record<string, string>;
  collapsibleOptional?: boolean;
}

export const CustomerFormFields: React.FC<CustomerFormFieldsProps> = ({
  form,
  onChange,
  errors = {},
  collapsibleOptional = false,
}) => {
  const [showMore, setShowMore] = useState(!collapsibleOptional);

  const handleTextChange = (key: keyof CustomerFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    let val = e.target.value;
    if (key === 'cnic') val = formatCNIC(val).slice(0, 15);
    if (['phone', 'phone2', 'whatsapp', 'emergencyPhone'].includes(key)) {
      val = formatPhone(val).slice(0, 12);
    }
    onChange(key, val);
  };

  return (
    <div className="space-y-5">
      {/* Personal Information */}
      <div>
        <h3 className="form-section-header">Personal Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Full Name" required error={errors.name}>
            <input
              className={`input-field ${errors.name ? 'input-error' : ''}`}
              value={form.name}
              onChange={handleTextChange('name')}
              placeholder="Muhammad Ahmed Khan"
            />
          </FormField>
          <FormField label="Father Name" required error={errors.fatherName}>
            <input
              className={`input-field ${errors.fatherName ? 'input-error' : ''}`}
              value={form.fatherName}
              onChange={handleTextChange('fatherName')}
              placeholder="Father's full name"
            />
          </FormField>
          <FormField
            label="CNIC"
            required
            error={errors.cnic}
            hint="Format: 35202-1234567-1"
          >
            <input
              className={`input-field font-mono ${errors.cnic ? 'input-error' : ''}`}
              value={form.cnic}
              onChange={handleTextChange('cnic')}
              placeholder="35202-1234567-1"
            />
          </FormField>
          <FormField label="Profession">
            <input
              className="input-field"
              value={form.profession}
              onChange={handleTextChange('profession')}
              placeholder="e.g., Business"
            />
          </FormField>
          <FormField label="Monthly Income (Rs.)">
            <input
              className="input-field"
              type="number"
              value={form.monthlyIncome}
              onChange={handleTextChange('monthlyIncome')}
              placeholder="e.g., 100000"
            />
          </FormField>
        </div>
      </div>

      {/* Contact Information */}
      <div>
        <h3 className="form-section-header">Contact Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Phone (Primary)"
            required
            error={errors.phone}
            hint="03XX-XXXXXXX"
          >
            <input
              className={`input-field ${errors.phone ? 'input-error' : ''}`}
              value={form.phone}
              onChange={handleTextChange('phone')}
              placeholder="0300-1234567"
            />
          </FormField>
          <FormField label="Phone 2 (Optional)">
            <input
              className="input-field"
              value={form.phone2}
              onChange={handleTextChange('phone2')}
              placeholder="0311-1234567"
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
              onChange={handleTextChange('email')}
              placeholder="email@example.com"
            />
          </FormField>
        </div>
      </div>

      {/* Address */}
      <div>
        <h3 className="form-section-header">Address</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Address" required error={errors.address}>
            <input
              className={`input-field ${errors.address ? 'input-error' : ''}`}
              value={form.address}
              onChange={handleTextChange('address')}
              placeholder="House #, Street, Area"
            />
          </FormField>
          <FormField label="City" required error={errors.city}>
            <input
              className={`input-field ${errors.city ? 'input-error' : ''}`}
              value={form.city}
              onChange={handleTextChange('city')}
              placeholder="e.g., Lahore"
            />
          </FormField>
        </div>
      </div>

      {/* Collapsible More Details Toggle if enabled */}
      {collapsibleOptional && (
        <button
          type="button"
          onClick={() => setShowMore(!showMore)}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline pt-1"
        >
          {showMore ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showMore ? 'Hide More Details' : 'More Details (Emergency Contact & Notes)'}
        </button>
      )}

      {showMore && (
        <>
          {/* Emergency Contact */}
          <div>
            <h3 className="form-section-header">Emergency Contact</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Emergency Contact Name">
                <input
                  className="input-field"
                  value={form.emergencyContact}
                  onChange={handleTextChange('emergencyContact')}
                  placeholder="Contact person name"
                />
              </FormField>
              <FormField label="Emergency Phone">
                <input
                  className="input-field"
                  value={form.emergencyPhone}
                  onChange={handleTextChange('emergencyPhone')}
                  placeholder="03XX-XXXXXXX"
                />
              </FormField>
            </div>
          </div>

          {/* Notes */}
          <FormField label="Notes">
            <textarea
              className="input-field h-20 resize-none"
              value={form.notes}
              onChange={handleTextChange('notes')}
              placeholder="Additional notes..."
            />
          </FormField>
        </>
      )}
    </div>
  );
};

export default CustomerFormFields;
