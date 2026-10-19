// ─── Core Types ──────────────────────────────────────────────────────────────

export type PlotStatus = 'available' | 'booked' | 'sold' | 'cancelled' | 'reserved';
export type SizeUnit = 'Marla' | 'Kanal' | 'Sq.Ft';
export type PlotCategory = 'Residential' | 'Commercial' | 'Corner' | 'Industrial' | string;
export type PaymentMethod = 'Cash' | 'Bank Transfer' | 'Cheque';
export type InstallmentStatus = 'pending' | 'paid' | 'overdue' | 'upcoming' | 'partial' | 'cancelled';
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'converted';
export type CommissionType = 'percentage' | 'fixed';
export type InvestmentType = 'Plot' | 'Cash' | 'Both';
export type UserRole = 'admin' | 'staff' | 'owner';
export type InstallmentType = 'Monthly' | 'Quarterly' | 'Semi-Annual' | 'Annual';
export type NomineeRelation = 'Wife' | 'Husband' | 'Son' | 'Daughter' | 'Brother' | 'Sister' | 'Father' | 'Mother' | 'Other';

// ─── Plot ────────────────────────────────────────────────────────────────────

export interface Plot {
  id: string;
  plotNumber: string;
  block: string;
  size: number;
  sizeUnit: SizeUnit;
  category: string;
  status: PlotStatus;
  location: string;
  description: string;
  createdAt: Date;
  // totalPrice removed from plot — set at booking time via per-marla rate
}

// ─── Plot Category ───────────────────────────────────────────────────────────

export interface PlotCategoryDoc {
  id: string;
  name: string;
  description: string;
  pricingNote: string;
  createdAt: Date;
}

// ─── Nominee ─────────────────────────────────────────────────────────────────

export interface NomineeDetails {
  nomineeName: string;
  nomineeRelation: NomineeRelation | string;
  nomineeCnic: string;
  nomineePhone: string;
  nomineeAddress: string;
}

// ─── Customer Documents ───────────────────────────────────────────────────────

export interface CustomerDocuments {
  cnicFront?: string;   // Firebase Storage URL
  cnicBack?: string;
  nomineeCnicFront?: string;
  nomineeCnicBack?: string;
  customerPhoto?: string;
  otherDocs?: string[];
}

// ─── Customer ────────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  customerId: string;    // e.g. CUST-2026-001
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
  monthlyIncome: number;
  emergencyContact: string;
  emergencyPhone: string;
  nominee: NomineeDetails;
  documents: CustomerDocuments;
  notes: string;
  createdAt: Date;
}

// ─── Booking ─────────────────────────────────────────────────────────────────

export interface Booking {
  id: string;
  receiptNumber: string;
  customerId: string;
  plotId: string;
  bookingDate: Date;
  perMarlaRate: number;       // NEW — rate per marla at time of booking
  totalPrice: number;         // NEW — calculated: perMarlaRate × size (in marla)
  bookingAmount: number;
  paymentMethod: PaymentMethod;
  bankName: string;
  chequeNumber: string;
  referenceNumber: string;
  notes: string;
  status: BookingStatus;
  createdAt: Date;
}

// ─── Custom Installment Row ───────────────────────────────────────────────────

export interface InstallmentRow {
  id: string;           // client-side uuid
  months: number;
  intervalMonths?: number;  // 1, 3, 6 or 12 (missing means 1)
  planAuto?: boolean;       // true while a saved payment plan drives this row
  monthlyAmount: number;
  totalAmount: number;  // auto: months × monthlyAmount
}

// ─── Sale (Assigned Plot) ─────────────────────────────────────────────────────

export interface Sale {
  id: string;
  saleNumber: string;
  customerId: string;
  plotId: string;
  bookingId?: string;
  perMarlaRate?: number;
  saleDate: Date;
  totalPrice: number;
  bookingAmountPaid: number;    // amount already paid at booking
  discount: number;
  finalPrice: number;
  downPayment: number;
  balanceAfterBooking: number;  // finalPrice - bookingAmountPaid
  remainingAmount: number;      // balanceAfterBooking - downPayment
  installmentRows: InstallmentRow[];  // custom plan rows
  
  // Down Payment detailed
  downPaymentPercent: number;
  downPaymentAmount: number;
  remainingDownPayment: number;    // amount customer still owes as down payment
  downPaymentReceived: number;     // amount received so far (excluding booking)
  downPaymentStatus: 'pending' | 'partial' | 'complete'; // 'pending'=nothing, 'partial'=some, 'complete'=all done
  
  // Semi-Annual
  semiAnnualEnabled: boolean;
  semiAnnualAmount: number;
  semiAnnualCount: number;
  semiAnnualTotal: number;
  
  // On-Possession
  onPossessionEnabled: boolean;
  onPossessionAmount: number;
  onPossessionDate: Date | null;
  onPossessionStatus: 'Pending' | 'Paid';
  onPossessionPaidDate: Date | null;
  onPossessionNotes: string;
  
  // Inline dealer info (no dealerId FK)
  dealerName: string;
  dealerPhone: string;
  dealerCommissionPercent: number;
  dealerCommissionAmount: number;
  dealerCommissionStatus: 'paid' | 'pending' | '';
  status: 'active' | 'completed' | 'cancelled';
  possessionGiven: boolean;

  // Saved payment plan (optional)
  paymentPlanId?: string;
  paymentPlanName?: string;
  paymentPlanModified?: boolean;
  createdAt: Date;
}

// ─── Down Payment Transaction ────────────────────────────────────────────────

export interface DownPaymentTransaction {
  id: string;
  saleId: string;
  customerId: string;
  plotId: string;
  amount: number;
  paymentDate: Date;
  paymentMethod: PaymentMethod;
  bankName: string;
  chequeNumber: string;
  receiptNumber: string;
  notes: string;
  createdAt: Date;
}

// ─── Payment Plan (kept for backward compat) ──────────────────────────────────

export interface PaymentPlan {
  id: string;
  name: string;
  duration: number;
  durationUnit: 'months' | 'years';
  installmentType: InstallmentType;
  downPaymentPercent: number;
  numberOfInstallments: number;
  notes: string;
  createdAt: Date;
}

// ─── Installment ──────────────────────────────────────────────────────────────

export interface Installment {
  id: string;
  receiptNumber: string;
  saleId: string;
  customerId: string;
  plotId: string;
  installmentNumber: number;
  totalInstallments: number;
  type?: 'monthly' | 'semi_annual' | string;
  frequency?: string;   // display only, e.g. "Quarterly"
  dueDate: Date;
  amountDue: number;
  amountPaid: number;

  paymentDate: Date | null;
  paymentMethod: PaymentMethod | '';
  bankName: string;
  chequeNumber: string;
  status: InstallmentStatus;
  notes: string;
  createdAt: Date;
}

// ─── Dealer ───────────────────────────────────────────────────────────────────

export interface Dealer {
  id: string;
  name: string;
  cnic: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  commissionType: CommissionType;
  commissionRate: number;
  notes: string;
  createdAt: Date;
}

// ─── Dealer Commission ────────────────────────────────────────────────────────

export interface DealerCommission {
  id: string;
  dealerId: string;
  dealerName: string;
  dealerPhone: string;
  saleId: string;
  saleAmount: number;
  downPayment: number;          // NEW — down payment amount on that sale
  commissionPercent: number;    // NEW — % used to calculate
  commissionAmount: number;
  paymentStatus: 'paid' | 'pending';
  paymentDate: Date | null;
  notes: string;
  createdAt: Date;
}

// ─── Dealer Ledger ────────────────────────────────────────────────────────────

export interface DealerLedgerEntry {
  id: string;
  dealerName: string;
  dealerPhone: string;
  type: 'commission_earned' | 'payment_made';
  amount: number;
  runningBalance: number;
  saleId?: string;
  plotInfo?: string;
  paymentMethod?: string;
  bankName?: string;
  chequeNumber?: string;
  note?: string;
  date: Date;
  createdAt: Date;
}



// ─── Company Settings ─────────────────────────────────────────────────────────

export interface CompanySettings {
  name: string;
  address: string;
  phone: string;
  whatsapp: string;
  email: string;
  logo: string;
  website: string;
  tagline: string;

  termsAndConditions?: string;
}

// ─── App User ─────────────────────────────────────────────────────────────────

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: Date;
  isEmailVerified?: boolean;
  emailVerifiedAt?: Date;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export interface DashboardStats {
  totalPlots: number;
  soldPlots: number;
  availablePlots: number;
  bookedPlots: number;
  totalCollection: number;
  pendingInstallments: number;
  overdueAmount: number;
}
