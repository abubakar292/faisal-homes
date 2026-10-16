import { CustomerStatement } from './ledgerStatement';
import { Customer, CompanySettings } from '../types';
import { formatCurrency, formatDate } from './formatters';

export const generateCustomerLedgerHTML = (
  company: CompanySettings,
  statement: CustomerStatement,
  customer: Customer,
  scopeLabel: string
): string => {
  let rowsHtml = '';
  statement.rows.forEach(r => {
    let stat = '';
    if (r.status === 'paid') stat = '<span style="color:#16a34a;font-weight:bold;">Paid</span>';
    else if (r.status === 'overdue') stat = '<span style="color:#dc2626;font-weight:bold;">Overdue</span>';
    else if (r.status === 'partial') stat = '<span style="color:#2563eb;font-weight:bold;">Partial</span>';
    else stat = '<span style="color:#64748b;">Pending</span>';

    rowsHtml += `
      <tr>
        <td>${r.label}</td>
        <td>${r.plotLabel}</td>
        <td>${formatDate(r.dueDate)}</td>
        <td style="text-align:right;">${formatCurrency(r.amountDue)}</td>
        <td style="text-align:right;color:#16a34a;">${formatCurrency(r.amountPaid)}</td>
        <td style="text-align:right;font-weight:bold;">${formatCurrency(r.outstanding)}</td>
        <td style="text-align:center;">${stat}</td>
      </tr>
    `;
  });

  let statementHtml = '';
  statement.statement.forEach(tx => {
    statementHtml += `
      <tr>
        <td>${formatDate(tx.date)}</td>
        <td>${tx.description}</td>
        <td style="font-family:monospace;font-size:10px;">${tx.reference || tx.method || '—'}</td>
        <td style="text-align:right;color:#dc2626;">${tx.debit > 0 ? formatCurrency(tx.debit) : ''}</td>
        <td style="text-align:right;color:#16a34a;">${tx.credit > 0 ? formatCurrency(tx.credit) : ''}</td>
        <td style="text-align:right;font-weight:bold;background:#f8fafc;">${formatCurrency(tx.balance)}</td>
      </tr>
    `;
  });

  return `
    <div class="company-header">
      <div>
        <div class="company-name">${company.name}</div>
        <div class="company-sub">${company.address} | ${company.phone}</div>
      </div>
      <div class="company-right">Print Date: ${formatDate(new Date())}</div>
    </div>
    
    <div class="doc-title-band">CUSTOMER LEDGER STATEMENT<div style="font-size:10px;font-weight:normal;opacity:0.9;">Scope: ${scopeLabel}</div></div>
    
    <div style="display:flex;justify-content:space-between;margin-bottom:20px;border-bottom:2px solid #1a3c6e;padding-bottom:15px;">
      <div style="flex:1;">
        <div style="font-weight:bold;font-size:16px;color:#1a3c6e;margin-bottom:5px;">${customer.name}</div>
        <div style="font-size:12px;color:#475569;">S/O ${customer.fatherName || '—'}</div>
        <div style="font-size:12px;color:#475569;">CNIC: ${customer.cnic}</div>
        <div style="font-size:12px;color:#475569;">Phone: ${customer.phone} ${customer.phone2 ? `/ ${customer.phone2}` : ''}</div>
      </div>
      <div style="flex:1;text-align:right;">
        <div style="font-size:12px;color:#475569;margin-bottom:2px;">Final Price: <b>Rs. ${formatCurrency(statement.summary.finalPrice)}</b></div>
        <div style="font-size:12px;color:#475569;margin-bottom:2px;">Total Received: <b style="color:#16a34a;">Rs. ${formatCurrency(statement.summary.totalReceived)}</b></div>
        <div style="font-size:14px;color:#1a3c6e;margin-top:5px;">Remaining Balance: <b>Rs. ${formatCurrency(statement.summary.remainingBalance)}</b></div>
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:20px;">
      <div style="flex:1;border:1px solid #ef4444;border-left:4px solid #ef4444;padding:10px;border-radius:4px;">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;">Overdue Amount (${statement.kpis.overdueCount})</div>
        <div style="font-size:16px;font-weight:bold;color:#ef4444;">Rs. ${formatCurrency(statement.kpis.overdueAmount)}</div>
      </div>
      <div style="flex:1;border:1px solid #f59e0b;border-left:4px solid #f59e0b;padding:10px;border-radius:4px;">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;">Pending Amount (${statement.kpis.pendingCount})</div>
        <div style="font-size:16px;font-weight:bold;color:#f59e0b;">Rs. ${formatCurrency(statement.kpis.pendingAmount)}</div>
      </div>
    </div>

    <h3 style="font-size:14px;color:#1a3c6e;margin-bottom:10px;border-bottom:1px solid #cbd5e1;padding-bottom:5px;">Payment Statement</h3>
    <table style="margin-bottom:30px;">
      <thead>
        <tr>
          <th style="width:12%;">Date</th>
          <th style="width:35%;">Description</th>
          <th style="width:13%;">Ref</th>
          <th style="width:13%;text-align:right;">Debit</th>
          <th style="width:13%;text-align:right;">Credit</th>
          <th style="width:14%;text-align:right;">Balance</th>
        </tr>
      </thead>
      <tbody>${statementHtml}</tbody>
      <tfoot>
        <tr>
          <td colspan="3" style="text-align:right;font-weight:bold;">Totals:</td>
          <td style="text-align:right;font-weight:bold;color:#dc2626;">Rs. ${formatCurrency(statement.statement.reduce((s, t) => s + t.debit, 0))}</td>
          <td style="text-align:right;font-weight:bold;color:#16a34a;">Rs. ${formatCurrency(statement.statement.reduce((s, t) => s + t.credit, 0))}</td>
          <td style="text-align:right;font-weight:bold;font-size:14px;">Rs. ${formatCurrency(statement.summary.remainingBalance)}</td>
        </tr>
      </tfoot>
    </table>

    <div style="page-break-before:always;"></div>
    
    <div class="company-header">
      <div>
        <div class="company-name">${company.name}</div>
        <div class="company-sub">Installment Schedule: ${customer.name}</div>
      </div>
      <div class="company-right">Print Date: ${formatDate(new Date())}</div>
    </div>

    <h3 style="font-size:14px;color:#1a3c6e;margin-bottom:10px;border-bottom:1px solid #cbd5e1;padding-bottom:5px;">Installment Schedule</h3>
    <table>
      <thead>
        <tr>
          <th style="width:25%;">Label</th>
          <th style="width:15%;">Plot</th>
          <th style="width:12%;">Due Date</th>
          <th style="width:13%;text-align:right;">Amount Due</th>
          <th style="width:13%;text-align:right;">Paid</th>
          <th style="width:13%;text-align:right;">Outstanding</th>
          <th style="width:9%;text-align:center;">Status</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot>
        <tr>
          <td colspan="3" style="text-align:right;font-weight:bold;">Totals:</td>
          <td style="text-align:right;font-weight:bold;">Rs. ${formatCurrency(statement.rows.reduce((s, r) => s + r.amountDue, 0))}</td>
          <td style="text-align:right;font-weight:bold;color:#16a34a;">Rs. ${formatCurrency(statement.rows.reduce((s, r) => s + r.amountPaid, 0))}</td>
          <td style="text-align:right;font-weight:bold;color:#1a3c6e;">Rs. ${formatCurrency(statement.rows.reduce((s, r) => s + r.outstanding, 0))}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  `;
};
