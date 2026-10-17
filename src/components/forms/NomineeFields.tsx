import React from 'react';
import FormField from '../ui/FormField';
import { formatCNIC, formatPhone } from '../../utils/formatters';
import type { NomineeDetails, NomineeRelation } from '../../types';

export const NOMINEE_RELATIONS: NomineeRelation[] = [
  'Wife',
  'Husband',
  'Son',
  'Daughter',
  'Brother',
  'Sister',
  'Father',
  'Mother',
  'Other',
];

interface NomineeFieldsProps {
  nominee: NomineeDetails;
  onChange: (key: keyof NomineeDetails, value: string) => void;
  errors?: Record<string, string>;
}

export const NomineeFields: React.FC<NomineeFieldsProps> = ({
  nominee,
  onChange,
  errors = {},
}) => {
  const handleTextChange = (key: keyof NomineeDetails) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    let val = e.target.value;
    if (key === 'nomineeCnic') val = formatCNIC(val).slice(0, 15);
    if (key === 'nomineePhone') val = formatPhone(val).slice(0, 12);
    onChange(key, val);
  };

  return (
    <div className="space-y-4">
      <h3 className="form-section-header">Nominee Details</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Nominee Full Name" required={false} error={errors.nomineeName}>
          <input
            className="input-field"
            value={nominee.nomineeName}
            onChange={handleTextChange('nomineeName')}
            placeholder="Nominee full name"
          />
        </FormField>
        <FormField label="Relation" required={false} error={errors.nomineeRelation}>
          <select
            className="input-field"
            value={nominee.nomineeRelation}
            onChange={handleTextChange('nomineeRelation')}
          >
            <option value="">Select relation...</option>
            {NOMINEE_RELATIONS.map(r => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Nominee CNIC" hint="Format: 35202-1234567-1" error={errors.nomineeCnic}>
          <input
            className="input-field font-mono"
            value={nominee.nomineeCnic}
            onChange={handleTextChange('nomineeCnic')}
            placeholder="35202-1234567-1"
          />
        </FormField>
        <FormField label="Nominee Phone" error={errors.nomineePhone}>
          <input
            className="input-field"
            value={nominee.nomineePhone}
            onChange={handleTextChange('nomineePhone')}
            placeholder="03XX-XXXXXXX"
          />
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Nominee Address" error={errors.nomineeAddress}>
            <input
              className="input-field"
              value={nominee.nomineeAddress}
              onChange={handleTextChange('nomineeAddress')}
              placeholder="Nominee address"
            />
          </FormField>
        </div>
      </div>
    </div>
  );
};

export default NomineeFields;
