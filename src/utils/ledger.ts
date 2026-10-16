import { Customer, Sale, Plot, Installment, DownPaymentTransaction } from '../types';
import { buildCustomerStatement } from './ledgerStatement';

export interface CustomerLedgerSummary {
  customerId: string;
  customerName: string;
  fatherName: string;
  cnic: string;
  phone: string;
  plots: string[];
  overdueCount: number;
  overdueAmount: number;
  pendingCount: number;
  pendingAmount: number;
  totalOutstanding: number;
  maxDaysOverdue: number;
  nextDue: { date: Date; amount: number; label: string } | null;
  severity: 'CRITICAL' | 'OVERDUE' | 'UPCOMING' | 'CLEAR';
}

export const buildCustomerLedgers = (
  customers: Customer[],
  sales: Sale[],
  plots: Plot[],
  installments: Installment[],
  dpTransactions: DownPaymentTransaction[]
): CustomerLedgerSummary[] => {
  const activeSales = sales.filter(s => s.status !== 'cancelled');
  
  return customers.map(customer => {
    const custSales = activeSales.filter(s => s.customerId === customer.id);
    if (custSales.length === 0) return null;
    
    // We can just use L1 statement builder
    const st = buildCustomerStatement('all', customer, custSales, plots, [], dpTransactions, installments);
    
    let severity: 'CRITICAL' | 'OVERDUE' | 'UPCOMING' | 'CLEAR' = 'CLEAR';
    if (st.kpis.overdueCount > 0) {
      severity = st.summary.maxDaysOverdue >= 90 ? 'CRITICAL' : 'OVERDUE';
    } else if (st.kpis.pendingCount > 0) {
      severity = 'UPCOMING';
    }

    const plotNames = st.saleBlocks.map(sb => `${sb.plotInfo.plotNumber}-${sb.plotInfo.block}`);

    return {
      customerId: customer.id,
      customerName: customer.name,
      fatherName: customer.fatherName || '',
      cnic: customer.cnic,
      phone: customer.phone,
      plots: plotNames,
      overdueCount: st.kpis.overdueCount,
      overdueAmount: st.kpis.overdueAmount,
      pendingCount: st.kpis.pendingCount,
      pendingAmount: st.kpis.pendingAmount,
      totalOutstanding: st.summary.remainingBalance, // wait, outstanding means remaining balance? Or just the unpaid installments? The table asks for "Total outstanding". In our terms, remainingBalance is the total remaining.
      maxDaysOverdue: st.summary.maxDaysOverdue,
      nextDue: st.summary.nextDue,
      severity
    };
  }).filter(Boolean) as CustomerLedgerSummary[];
};
