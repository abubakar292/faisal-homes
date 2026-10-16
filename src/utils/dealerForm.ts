import { validateCNIC } from './formatters';
import type { CommissionType } from '../types';

export interface DealerFormData {
  name: string;
  cnic: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  notes: string;
  commissionType?: CommissionType;
  commissionRate?: number;
}

export const defaultDealerFormData: DealerFormData = {
  name: '',
  cnic: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  notes: '',
  commissionType: 'percentage',
  commissionRate: 0,
};

export function validateDealer(values: DealerFormData): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!values.name.trim()) errors.name = 'Name required';
  if (!values.cnic.trim() || !validateCNIC(values.cnic)) {
    errors.cnic = 'Valid CNIC required (XXXXX-XXXXXXX-X)';
  }
  if (!values.phone.trim()) errors.phone = 'Phone required';

  return errors;
}

export function buildDealerPayload(values: DealerFormData) {
  return {
    name: values.name.trim(),
    cnic: values.cnic,
    phone: values.phone,
    whatsapp: values.whatsapp || '',
    email: values.email.trim(),
    address: values.address.trim(),
    notes: values.notes.trim(),
    commissionType: values.commissionType || 'percentage',
    commissionRate: values.commissionRate || 0,
  };
}
