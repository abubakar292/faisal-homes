import { format, isValid } from 'date-fns';
import {
  getDaysOverdueKarachi,
  getDaysUntilDueKarachi,
  isInstallmentOverdue as isDomainInstallmentOverdue,
  getInstallmentOutstanding,
} from '../domain/metrics';

export const formatCurrency = (amount: number): string => {
  if (isNaN(amount)) return 'Rs. 0';
  return `Rs. ${amount.toLocaleString('en-PK')}`;
};

export const formatDate = (date: Date | string | null | undefined): string => {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (!isValid(d)) return '—';
  return format(d, 'dd/MM/yyyy');
};

export const formatDateTime = (date: Date | string | null | undefined): string => {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (!isValid(d)) return '—';
  return format(d, 'dd/MM/yyyy hh:mm a');
};

export const formatDateInput = (date: Date | null | undefined): string => {
  if (!date || !isValid(date)) return '';
  return format(date, 'yyyy-MM-dd');
};

export const parseDateInput = (value: string): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  return isValid(d) ? d : null;
};

export const formatCNIC = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`;
};

export const validateCNIC = (cnic: string): boolean => {
  return /^\d{5}-\d{7}-\d{1}$/.test(cnic);
};

export const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4, 11)}`;
};

export const validatePhone = (phone: string): boolean => {
  return /^03\d{2}-\d{7}$/.test(phone);
};

export const generateReceiptNumber = (prefix: string): string => {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}-${year}-${rand}`;
};

export const shortenText = (text: string, maxLen = 30): string => {
  if (!text) return '—';
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
};

export const getDaysOverdue = (dueDate: Date): number => {
  return getDaysOverdueKarachi(dueDate);
};

export const getOutstanding = (inst: any): number => {
  return getInstallmentOutstanding(inst);
};

const parseDate = (d: any): Date | null => {
  if (!d) return null;
  if (d.toDate) return d.toDate(); // Firestore Timestamp
  const parsed = new Date(d);
  return isValid(parsed) ? parsed : null;
};

export const daysOverdue = (inst: any, today: Date = new Date()): number => {
  const due = parseDate(inst?.dueDate);
  if (!due) return 0;
  return getDaysOverdueKarachi(due, today);
};

export const daysUntilDue = (inst: any, today: Date = new Date()): number => {
  const due = parseDate(inst?.dueDate);
  if (!due) return 0;
  return getDaysUntilDueKarachi(due, today);
};

export const isInstallmentOverdue = (inst: any, today: Date = new Date()): boolean => {
  if (!inst) return false;
  if (inst.type === 'down_payment') return false;
  if (inst.status === 'cancelled') return false;
  return isDomainInstallmentOverdue(inst, today);
};

export const getInstallmentStatus = (inst: any): string => {
  if (!inst) return 'pending';
  if (inst.status === 'cancelled') return 'cancelled';
  if (inst.type === 'down_payment') {
    return (inst.status === 'paid' || getOutstanding(inst) === 0) ? 'paid' : 'pending';
  }
  if (getOutstanding(inst) === 0 && (inst.amountPaid || 0) >= (inst.amountDue || 0)) return 'paid';
  if (isInstallmentOverdue(inst)) return 'overdue';
  if ((inst.amountPaid || 0) > 0) return 'partial';
  return 'pending';
};

export const installmentLabel = (inst: any): string => {
  if (inst.type === 'down_payment') return 'Down Payment';
  if (inst.type === 'on_possession') return 'On Possession';
  if (inst.type === 'semi_annual') return `Semi-Annual #${inst.installmentNumber}`;
  if (inst.frequency) return `${inst.frequency} #${inst.installmentNumber}`;
  return `Installment #${inst.installmentNumber}`;
};

export const getWhatsAppUrl = (phone: string, message: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  const intl = cleaned.startsWith('0') ? '92' + cleaned.slice(1) : cleaned;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
};
