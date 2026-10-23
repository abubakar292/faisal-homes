import { CustomerStatement } from './ledgerStatement';
import { Customer, CompanySettings } from '../types';
import { formatCurrency, formatDate } from './formatters';
import { buildLetterheadDocument } from './letterhead';

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
        <td style="padding:4px 6px;">${r.label}</td>
        <td style="padding:4px 6px;">${r.plotLabel}</td>
        <td style="padding:4px 6px;">${formatDate(r.dueDate)}</td>
        <td style="padding:4px 6px;text-align:right;">${formatCurrency(r.amountDue)}</td>
        <td style="padding:4px 6px;text-align:right;color:#16a34a;">${formatCurrency(r.amountPaid)}</td>
        <td style="padding:4px 6px;text-align:right;font-weight:bold;">${formatCurrency(r.outstanding)}</td>
        <td style="padding:4px 6px;text-align:center;">${stat}</td>
      </tr>
    `;
  });

  let statementHtml = '';
  statement.statement.forEach(tx => {
    statementHtml += `
      <tr>
        <td style="padding:4px 6px;">${formatDate(tx.date)}</td>
        <td style="padding:4px 6px;">${tx.description}</td>
        <td style="padding:4px 6px;font-family:monospace;font-size:9pt;">${tx.reference || tx.method || '-'}</td>
        <td style="padding:4px 6px;text-align:right;color:#dc2626;">${tx.debit > 0 ? formatCurrency(tx.debit) : ''}</td>
        <td style="padding:4px 6px;text-align:right;color:#16a34a;">${tx.credit > 0 ? formatCurrency(tx.credit) : ''}</td>
        <td style="padding:4px 6px;text-align:right;font-weight:bold;background:#f8fafc;">${formatCurrency(tx.balance)}</td>
      </tr>
    `;
  });

  const section1Html = `
    <div style="display:flex;justify-content:space-between;margin-bottom:12px;font-size:9.5pt;color:#64748b;">
      <div>Project: <strong style="color:#1a3c6e;">${company.name}</strong></div>
      <div>Scope: <strong>${scopeLabel}</strong> | Date: <strong>${formatDate(new Date())}</strong></div>
    </div>

    <div style="display:flex;justify-content:space-between;margin-bottom:12px;border:1px solid #cbd5e1;border-radius:4px;padding:10px;background:#f8fafc;">
      <div>
        <div style="font-weight:bold;font-size:12pt;color:#1a3c6e;margin-bottom:3px;">${customer.name}</div>
        <div style="font-size:9.5pt;color:#475569;">S/O ${customer.fatherName || '-'}</div>
        <div style="font-size:9.5pt;color:#475569;">CNIC: ${customer.cnic}</div>
        <div style="font-size:9.5pt;color:#475569;">Phone: ${customer.phone} ${customer.phone2 ? `/ ${customer.phone2}` : ''}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:9.5pt;color:#475569;margin-bottom:2px;">Final Price: <b>${formatCurrency(statement.summary.finalPrice)}</b></div>
        <div style="font-size:9.5pt;color:#475569;margin-bottom:2px;">Total Received: <b style="color:#16a34a;">${formatCurrency(statement.summary.totalReceived)}</b></div>
        <div style="font-size:11pt;color:#1a3c6e;margin-top:4px;">Remaining Balance: <b>${formatCurrency(statement.summary.remainingBalance)}</b></div>
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:12px;">
      <div style="flex:1;border:1px solid #ef4444;border-left:4px solid #ef4444;padding:8px 10px;border-radius:4px;background:#fff5f5;">
        <div style="font-size:8.5pt;color:#64748b;text-transform:uppercase;font-weight:bold;">Overdue Amount (${statement.kpis.overdueCount})</div>
        <div style="font-size:12pt;font-weight:bold;color:#ef4444;margin-top:2px;">${formatCurrency(statement.kpis.overdueAmount)}</div>
      </div>
      <div style="flex:1;border:1px solid #f59e0b;border-left:4px solid #f59e0b;padding:8px 10px;border-radius:4px;background:#fffdf5;">
        <div style="font-size:8.5pt;color:#64748b;text-transform:uppercase;font-weight:bold;">Pending Amount (${statement.kpis.pendingCount})</div>
        <div style="font-size:12pt;font-weight:bold;color:#f59e0b;margin-top:2px;">${formatCurrency(statement.kpis.pendingAmount)}</div>
      </div>
    </div>

    <div class="lh-info-title" style="margin-bottom:6px;">Payment Statement</div>
    <table class="lh-table" style="margin-bottom:12px;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="width:14%;">Date</th>
          <th style="width:34%;">Description</th>
          <th style="width:14%;">Ref</th>
          <th style="width:12%;text-align:right;">Debit</th>
          <th style="width:12%;text-align:right;">Credit</th>
          <th style="width:14%;text-align:right;">Balance</th>
        </tr>
      </thead>
      <tbody>${statementHtml}</tbody>
      <tfoot>
        <tr style="background:#f8fafc;font-weight:bold;">
          <td colspan="3" style="text-align:right;padding:5px 6px;">Totals:</td>
          <td style="text-align:right;color:#dc2626;padding:5px 6px;">${formatCurrency(statement.statement.reduce((s, t) => s + t.debit, 0))}</td>
          <td style="text-align:right;color:#16a34a;padding:5px 6px;">${formatCurrency(statement.statement.reduce((s, t) => s + t.credit, 0))}</td>
          <td style="text-align:right;padding:5px 6px;">${formatCurrency(statement.summary.remainingBalance)}</td>
        </tr>
      </tfoot>
    </table>
  `;

  const section2Html = `
    <div style="margin-bottom:10px;font-size:9.5pt;color:#64748b;">
      Installment schedule for <strong>${customer.name}</strong> (${customer.customerId})
    </div>
    <table class="lh-table">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="width:25%;">Label</th>
          <th style="width:15%;">Plot</th>
          <th style="width:14%;">Due Date</th>
          <th style="width:13%;text-align:right;">Amount Due</th>
          <th style="width:12%;text-align:right;">Paid</th>
          <th style="width:12%;text-align:right;">Outstanding</th>
          <th style="width:9%;text-align:center;">Status</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot>
        <tr style="background:#f8fafc;font-weight:bold;">
          <td colspan="3" style="text-align:right;padding:5px 6px;">Totals:</td>
          <td style="text-align:right;padding:5px 6px;">${formatCurrency(statement.rows.reduce((s, r) => s + r.amountDue, 0))}</td>
          <td style="text-align:right;color:#16a34a;padding:5px 6px;">${formatCurrency(statement.rows.reduce((s, r) => s + r.amountPaid, 0))}</td>
          <td style="text-align:right;color:#1a3c6e;padding:5px 6px;">${formatCurrency(statement.rows.reduce((s, r) => s + r.outstanding, 0))}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  `;

  return buildLetterheadDocument({
    layout: 'report',
    report: {
      title: 'Customer Ledger Statement',
      subtitle: `Project: ${company.name} | Scope: ${scopeLabel}`,
      rawHtml: section1Html + '<div class="lh-section-break"></div>' + section2Html
    }
  });
};
