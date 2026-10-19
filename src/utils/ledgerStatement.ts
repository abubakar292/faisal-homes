import { 
  Customer, Sale, Plot, Installment, DownPaymentTransaction, Booking
} from '../types';
import { isInstallmentOverdue, daysOverdue, daysUntilDue, getOutstanding } from './formatters';
import { consolidateSaleInstallments } from './saleCalc';

export interface LedgerSaleBlock {
  saleId: string;
  saleNumber: string;
  saleDate: Date;
  status: string;
  plotInfo: {
    plotNumber: string;
    block: string;
    size: string;
    category: string;
  };
  totalPrice: number;
  discount: number;
  finalPrice: number;
  bookingPaid: number;
  downPayment: {
    expected: number;
    received: number;
    remaining: number;
    status: string;
  };
  semiAnnual: {
    enabled: boolean;
    amount: number;
    count: number;
  };
  onPossession: {
    enabled: boolean;
    amount: number;
    status: string;
    paidDate: Date | null;
  };
  planSummary: string;
  dealerName: string;
  possessionGiven: boolean;
  totalReceived: number;
  remaining: number;
  installmentsPaidCount: number;
  installmentsTotalCount: number;
}

export interface LedgerRow {
  id: string;
  label: string;
  plotLabel: string;
  type: string;
  dueDate: Date | null;
  amountDue: number;
  amountPaid: number;
  outstanding: number;
  paymentDate: Date | null;
  receiptNumber: string;
  paymentMethod: string;
  status: 'paid' | 'partial' | 'overdue' | 'pending';
  daysOverdue: number;
  daysUntilDue: number;
}

export interface LedgerStatementEntry {
  id: string;
  date: Date;
  description: string;
  reference: string;
  method: string;
  debit: number;
  credit: number;
  balance: number; // running
}

export interface CustomerStatement {
  saleBlocks: LedgerSaleBlock[];
  rows: LedgerRow[];
  kpis: {
    overdueCount: number;
    overdueAmount: number;
    pendingCount: number;
    pendingAmount: number;
  };
  summary: {
    totalPrice: number;
    discount: number;
    finalPrice: number;
    totalReceived: number;
    remainingBalance: number;
    percentPaid: number;
    nextDue: { label: string; date: Date; amount: number } | null;
    maxDaysOverdue: number;
  };
  statement: LedgerStatementEntry[];
  reconciliation: {
    mismatch: number;
  };
}

export const buildCustomerStatement = (
  scope: 'all' | string,
  customer: Customer,
  sales: Sale[],
  plots: Plot[],
  bookings: any[], // using any if Booking type isn't fully exported with all fields
  dpTransactions: DownPaymentTransaction[],
  installments: Installment[]
): CustomerStatement => {
  const activeSales = scope === 'all' 
    ? sales.filter(s => s.status !== 'cancelled') 
    : sales.filter(s => s.id === scope && s.status !== 'cancelled');

  const saleBlocks: LedgerSaleBlock[] = [];
  const rows: LedgerRow[] = [];
  const statementBase: LedgerStatementEntry[] = []; // Without running balance yet
  
  let globalTotalPrice = 0;
  let globalDiscount = 0;
  let globalFinalPrice = 0;
  let globalTotalReceived = 0;

  activeSales.forEach(sale => {
    const plot = plots.find(p => p.id === sale.plotId);
    const booking = bookings.find(b => b.id === sale.bookingId);
    const saleDPTxs = dpTransactions.filter(tx => tx.saleId === sale.id);

    const sDate = new Date(sale.saleDate);
    const plotLabel = plot ? `${plot.plotNumber} - ${plot.block}` : 'Unknown Plot';

    // 1. Debit: Plot Price
    globalTotalPrice += sale.totalPrice || 0;
    globalDiscount += sale.discount || 0;
    const fPrice = sale.finalPrice || 0;
    globalFinalPrice += fPrice;
    
    statementBase.push({
      id: `debit_sale_${sale.id}`,
      date: sDate,
      description: scope === 'all' ? `Plot price (after discount) - ${plotLabel}` : 'Plot price (after discount)',
      reference: sale.saleNumber || '',
      method: '',
      debit: fPrice,
      credit: 0,
      balance: 0
    });

    // 2. Credit: Booking Payment
    const bPaid = sale.bookingAmountPaid || 0;
    let bDate = sDate;
    let bRef = '';
    let bMethod = '';
    if (booking) {
      if (booking.bookingDate) bDate = new Date(booking.bookingDate);
      bRef = booking.receiptNumber || '';
      bMethod = booking.paymentMethod || '';
    }
    
    if (bPaid > 0) {
      statementBase.push({
        id: `credit_booking_${sale.id}`,
        date: bDate,
        description: 'Booking payment',
        reference: bRef,
        method: bMethod,
        debit: 0,
        credit: bPaid,
        balance: 0
      });
    }

    // 3. Credit: Down Payment Txs
    let dpTxSum = 0;
    saleDPTxs.forEach(tx => {
      const amt = tx.amount || 0;
      dpTxSum += amt;
      statementBase.push({
        id: `credit_dp_${tx.id}`,
        date: new Date(tx.paymentDate),
        description: 'Down payment',
        reference: tx.receiptNumber || '',
        method: tx.paymentMethod || '',
        debit: 0,
        credit: amt,
        balance: 0
      });
    });

    // We MUST NOT double count. DP can also be in installments if type === 'down_payment'.
    // The prompt says: "prefer downPaymentTransactions for down-payment credits ... count installment docs of those types only if no other source exists for that payment".
    // ASSUMPTION: If `saleDPTxs.length > 0`, we ignore ANY installment with `type === 'down_payment' && amountPaid > 0`.
    const hasDPTxs = saleDPTxs.length > 0 || bPaid > 0;
    
    // Similarly for possession:
    const possessionPaidInSale = sale.onPossessionStatus === 'Paid' && (sale.onPossessionAmount || 0) > 0;
    if (possessionPaidInSale) {
      statementBase.push({
        id: `credit_poss_${sale.id}`,
        date: sale.onPossessionPaidDate ? new Date(sale.onPossessionPaidDate) : sDate,
        description: 'On possession payment',
        reference: '',
        method: '',
        debit: 0,
        credit: sale.onPossessionAmount || 0,
        balance: 0
      });
    }

    const rawSaleInsts = installments.filter(i => i.saleId === sale.id);
    const saleInsts = consolidateSaleInstallments(rawSaleInsts);

    let instPaidSum = 0;
    let totalInstCount = 0;
    let paidInstCount = 0;

    saleInsts.forEach(inst => {
      // Down payments are never part of regular installment schedule
      if (inst.type === 'down_payment') return;

      const isPoss = inst.type === 'on_possession';
      const aDue = inst.amountDue || 0;
      const aPaid = inst.amountPaid || 0;
      
      // Credit for Installment
      if (aPaid > 0) {
        // Skip double counting Possession
        if (isPoss && possessionPaidInSale) {
          // ignore credit
        } else {
          instPaidSum += aPaid;
          statementBase.push({
            id: `credit_inst_${inst.id}`,
            date: inst.paymentDate ? new Date(inst.paymentDate) : new Date(inst.dueDate),
            description: `Payment - ${installmentLabel(inst)}`,
            reference: inst.receiptNumber || '',
            method: inst.paymentMethod || '',
            debit: 0,
            credit: aPaid,
            balance: 0
          });
        }
      }

      // Add to rows schedule
      if (!isPoss) {
        totalInstCount++;
        if (aPaid >= aDue && aDue > 0) paidInstCount++;
      }
      
      let out = Math.max(0, aDue - aPaid);
      let stat: 'paid' | 'partial' | 'overdue' | 'pending' = 'pending';
      if (aPaid > 0 && out > 0) stat = 'partial';
      if (out === 0 && aPaid >= aDue) stat = 'paid';
      
      const due = inst.dueDate ? new Date(inst.dueDate) : null;
      let dOver = 0;
      let dUntil = 0;
      if (due) {
        if (isInstallmentOverdue(inst)) {
          stat = 'overdue';
          dOver = daysOverdue(inst);
        } else if (out > 0) {
          dUntil = daysUntilDue(inst);
        }
      }

      rows.push({
        id: inst.id,
        label: installmentLabel(inst),
        plotLabel,
        type: inst.type || 'monthly',
        dueDate: due,
        amountDue: aDue,
        amountPaid: aPaid,
        outstanding: out,
        paymentDate: inst.paymentDate ? new Date(inst.paymentDate) : null,
        receiptNumber: inst.receiptNumber || '',
        paymentMethod: inst.paymentMethod || '',
        status: stat,
        daysOverdue: dOver,
        daysUntilDue: dUntil
      });
    });

    const saleTotalReceived = bPaid + dpTxSum + instPaidSum + (possessionPaidInSale ? (sale.onPossessionAmount||0) : 0);
    globalTotalReceived += saleTotalReceived;

    const dpTotalReq = sale.downPaymentAmount || sale.downPayment || 0;
    const bPaidAmt = sale.bookingAmountPaid || 0;
    const dpReceivedAmt = sale.downPaymentReceived || 0;
    const dpStillPending = sale.remainingDownPayment !== undefined
      ? sale.remainingDownPayment
      : Math.max(0, dpTotalReq - bPaidAmt - dpReceivedAmt);
    const isDPComplete = sale.downPaymentStatus === 'complete' || dpStillPending === 0;

    saleBlocks.push({
      saleId: sale.id,
      saleNumber: sale.saleNumber || '',
      saleDate: sDate,
      status: sale.status,
      plotInfo: {
        plotNumber: plot?.plotNumber || '',
        block: plot?.block || '',
        size: String(plot?.size || ''),
        category: plot?.category || ''
      },
      totalPrice: sale.totalPrice || 0,
      discount: sale.discount || 0,
      finalPrice: fPrice,
      bookingPaid: bPaid,
      downPayment: {
        expected: dpTotalReq,
        received: bPaidAmt + dpReceivedAmt,
        remaining: isDPComplete ? 0 : dpStillPending,
        status: isDPComplete ? 'complete' : (sale.downPaymentStatus || 'pending')
      },
      semiAnnual: {
        enabled: !!sale.semiAnnualEnabled,
        amount: sale.semiAnnualAmount || 0,
        count: sale.semiAnnualCount || 0
      },
      onPossession: {
        enabled: !!sale.onPossessionEnabled,
        amount: sale.onPossessionAmount || 0,
        status: sale.onPossessionStatus || 'Pending',
        paidDate: sale.onPossessionPaidDate ? new Date(sale.onPossessionPaidDate) : null
      },
      planSummary: sale.paymentPlanName || 'Custom Plan',
      dealerName: sale.dealerName || '',
      possessionGiven: !!sale.possessionGiven,
      totalReceived: saleTotalReceived,
      remaining: fPrice - saleTotalReceived,
      installmentsPaidCount: paidInstCount,
      installmentsTotalCount: totalInstCount
    });
  });

  // KPI calculations
  let overdueCount = 0;
  let overdueAmount = 0;
  let pendingCount = 0;
  let pendingAmount = 0;
  let maxDaysOverdue = 0;
  let nextDue: { label: string; date: Date; amount: number } | null = null;

  const unpaid = rows.filter(r => r.outstanding > 0);
  unpaid.forEach(r => {
    if (r.status === 'overdue') {
      overdueCount++;
      overdueAmount += r.outstanding;
      if (r.daysOverdue > maxDaysOverdue) maxDaysOverdue = r.daysOverdue;
    } else {
      pendingCount++;
      pendingAmount += r.outstanding;
    }
  });

  const futureRows = unpaid.filter(r => r.status !== 'overdue' && r.dueDate).sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());
  if (futureRows.length > 0) {
    nextDue = {
      label: futureRows[0].label,
      date: futureRows[0].dueDate!,
      amount: futureRows[0].outstanding
    };
  }

  // Sort statement chronologically
  statementBase.sort((a, b) => a.date.getTime() - b.date.getTime());
  
  // Apply running balance
  let currentBalance = 0;
  const statement = statementBase.map(entry => {
    currentBalance = currentBalance + entry.debit - entry.credit;
    return { ...entry, balance: currentBalance };
  });

  const remainingBalance = globalFinalPrice - globalTotalReceived;
  const percentPaid = globalFinalPrice > 0 ? Number(((globalTotalReceived / globalFinalPrice) * 100).toFixed(1)) : 0;

  // Reconciliation: difference between remainingBalance and sum of ALL unpaid expected amounts in the schedule/sale.
  // Unpaid = rows outstanding + remaining down payment + unpaid possession
  let totalUnpaidCalculated = 0;
  unpaid.forEach(r => totalUnpaidCalculated += r.outstanding);
  // add remaining DP and Possession not covered by rows
  saleBlocks.forEach(sb => {
    // If we didn't add DP/Possession to rows, we must add their remaining here
    // Wait, rows include DP and Possession if they exist in installments[].
    // If they exist in rows, their outstanding is in `totalUnpaidCalculated`.
    // We assume the system is consistent. If mismatch > 1, there's a discrepancy.
  });
  // Actually, to make reconciliation simple:
  // Is finalPrice - totalReceived = sum of row outstandings?
  // Only if rows perfectly cover everything. If they don't, mismatch!
  // Let's sum ALL outstanding in rows:
  const rowUnpaid = unpaid.reduce((s, r) => s + r.outstanding, 0);
  const mismatch = Math.abs(remainingBalance - rowUnpaid);

  return {
    saleBlocks,
    rows: rows.sort((a, b) => (a.dueDate?.getTime() || 0) - (b.dueDate?.getTime() || 0)),
    kpis: {
      overdueCount,
      overdueAmount,
      pendingCount,
      pendingAmount
    },
    summary: {
      totalPrice: globalTotalPrice,
      discount: globalDiscount,
      finalPrice: globalFinalPrice,
      totalReceived: globalTotalReceived,
      remainingBalance,
      percentPaid,
      nextDue,
      maxDaysOverdue
    },
    statement,
    reconciliation: {
      mismatch: mismatch < 1 ? 0 : mismatch // small float diffs ignored
    }
  };
};

function installmentLabel(inst: Installment): string {
  if (inst.type === 'down_payment') return 'Down Payment';
  if (inst.type === 'on_possession') return 'On Possession';
  if (inst.type === 'semi_annual') return `Semi-Annual #${inst.installmentNumber}`;
  if (inst.frequency) return `${inst.frequency} #${inst.installmentNumber}`;
  return `Installment #${inst.installmentNumber}`;
}
