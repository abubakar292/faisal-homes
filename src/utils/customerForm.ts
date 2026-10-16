import { validateCNIC } from './formatters';
import type { NomineeDetails, CustomerDocuments } from '../types';

export interface CustomerFormData {
  name: string;
  fatherName: string;
  cnic: string;
  phone: string;
  phone2: string;
  email: string;
  whatsapp: string;
  address: string;
  city: string;
  profession: string;
  monthlyIncome: string;
  emergencyContact: string;
  emergencyPhone: string;
  notes: string;
}

export const defaultCustomerFormData: CustomerFormData = {
  name: '',
  fatherName: '',
  cnic: '',
  phone: '',
  phone2: '',
  email: '',
  whatsapp: '',
  address: '',
  city: '',
  profession: '',
  monthlyIncome: '',
  emergencyContact: '',
  emergencyPhone: '',
  notes: '',
};

export const defaultNomineeDetails: NomineeDetails = {
  nomineeName: '',
  nomineeRelation: '',
  nomineeCnic: '',
  nomineePhone: '',
  nomineeAddress: '',
};

export function validateCustomer(values: CustomerFormData): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!values.name.trim()) errors.name = 'Full name is required';
  if (!values.fatherName.trim()) errors.fatherName = "Father's name is required";
  if (!values.cnic.trim()) {
    errors.cnic = 'CNIC is required';
  } else if (!validateCNIC(values.cnic)) {
    errors.cnic = 'Format: 35202-1234567-1';
  }
  if (!values.phone.trim()) errors.phone = 'Phone is required';
  if (!values.address.trim()) errors.address = 'Address is required';
  if (!values.city.trim()) errors.city = 'City is required';

  return errors;
}

export function buildCustomerPayload(
  values: CustomerFormData,
  nominee: NomineeDetails = defaultNomineeDetails,
  documents: CustomerDocuments = {}
) {
  return {
    name: values.name.trim(),
    fatherName: values.fatherName.trim(),
    cnic: values.cnic,
    phone: values.phone,
    phone2: values.phone2 || '',
    email: values.email.trim(),
    whatsapp: values.whatsapp || '',
    address: values.address.trim(),
    city: values.city.trim(),
    profession: values.profession.trim(),
    monthlyIncome: values.monthlyIncome ? Number(values.monthlyIncome) : 0,
    emergencyContact: values.emergencyContact.trim(),
    emergencyPhone: values.emergencyPhone || '',
    nominee,
    documents,
    notes: values.notes.trim(),
  };
}
