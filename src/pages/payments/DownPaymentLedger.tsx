import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer, CreditCard, DollarSign } from 'lucide-react';
import { getDocument, getCollection, subscribeCollection } from '../../firebase/firestore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { printInNewWindow, generateDownPaymentReceiptHTML } from '../../utils/printUtils';
import type { Sale, Customer, Plot, DownPaymentTransaction, CompanySettings } from '../../types';
import { BrandLoader } from '../../components/brand';

const DownPaymentLedger: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const saleId = searchParams.get('saleId') || '';

  const [sale, setSale]           = useState<Sale | null>(null);
  const [customer, setCustomer]   = useState<Customer | null>(null);
  const [plot, setPlot]           = useState<Plot | null>(null);
  const [company, setCompany]     = useState<CompanySettings | null>(null);
  const [txns, setTxns]           = useState<DownPaymentTransaction[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!saleId) { setLoading(false); return; }

    const loadStatic = async () => {
      const s = await getDocument<Sale>('sales', saleId);
      if (!s) { setLoading(false); return; }
      setSale(s);

      const [cust, pl, comp] = await Promise.all([
        getDocument<Customer>('customers', s.customerId),
        getDocument<Plot>('plots', s.plotId),
        getDocument<CompanySettings>('settings', 'company'),
      ]);
      setCustomer(cust);
      setPlot(pl);
      if (comp) setCompany(comp);
      setLoading(false);
    };

    loadStatic();

    // Real-time transactions
    const unsub = subscribeCollection<DownPaymentTransaction>(
      'downPaymentTransactions',
      (data) => {
        setTxns(
          data
            .filter(t => t.saleId === saleId)
            .sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime())
        );
      }
    );

    return () => unsub();
  }, [saleId]);

  if (loading) {
    return <BrandLoader />;
  }

  if (!sale || !customer || !plot) {
    return (
      <div className="card text-center py-12 text-red-500">
        Sale record not found. <button onClick={() => navigate(-1)} className="underline ml-2">Go back</button>
      </div>
    );
  }

  const totalDownPayment  = sale.downPaymentAmount || 0;
  const bookingPaid       = sale.bookingAmountPaid || 0;
  const remainingRequired = sale.remainingDownPayment || 0;
  const receivedSoFar     = sale.downPaymentReceived || 0;
  const stillPending      = Math.max(0, remainingRequired - receivedSoFar);

  let dpStatus: 'complete' | 'partial' | 'pending';
  if (stillPending === 0)     dpStatus = 'complete';
  else if (receivedSoFar > 0) dpStatus = 'partial';
  else                        dpStatus = 'pending';

  const statusLabel = dpStatus === 'complete' ? '✅ Fully Paid' : dpStatus === 'partial' ? '🔄 Partially Paid' : '❌ Not Started';
  const statusColor = dpStatus === 'complete' ? '#16a34a' : dpStatus === 'partial' ? '#b45309' : '#b91c1c';

  const handlePrintLedger = () => {
    if (!company) return;
    let txRows = `
      <tr style="background:#fffbeb;">
        <td style="padding:5px 8px;">📌 Booking Amount</td>
        <td>Cash</td>
        <td style="text-align:right;font-weight:bold;">Rs. ${formatCurrency(bookingPaid)}</td>
        <td>${formatDate(sale.saleDate)}</td>
        <td style="color:#666;font-size:10px;">Auto-entry from booking</td>
      </tr>
    `;
    let running = bookingPaid;
    txns.forEach(tx => {
      running += tx.amount;
      txRows += `
        <tr>
          <td style="padding:5px 8px;">✅ Down Payment Received</td>
          <td>${tx.paymentMethod}${tx.bankName ? ` — ${tx.bankName}` : ''}</td>
          <td style="text-align:right;font-weight:bold;color:#16a34a;">Rs. ${formatCurrency(tx.amount)}</td>
          <td>${formatDate(tx.paymentDate)}</td>
          <td style="color:#666;">${tx.notes || '—'}</td>
        </tr>
      `;
    });
    if (stillPending > 0) {
      txRows += `
        <tr style="background:#fef2f2;">
          <td style="padding:5px 8px;color:#b91c1c;">⏳ Remaining Pending</td>
          <td>—</td>
          <td style="text-align:right;font-weight:bold;color:#b91c1c;">Rs. ${formatCurrency(stillPending)}</td>
          <td>Due: ASAP</td>
          <td>—</td>
        </tr>
      `;
    }

    const html = `
      <div style="background:#1a3c6e;color:white;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:16px;font-weight:bold;">${company.name}</div>
          <div style="font-size:9px;opacity:0.85;">${company.address} | ${company.phone}</div>
        </div>
        <div style="text-align:right;font-size:9px;opacity:0.85;">Print Date: ${formatDate(new Date())}</div>
      </div>
      <div style="background:#e8a020;color:white;text-align:center;padding:6px;font-size:13px;font-weight:bold;letter-spacing:1px;margin-bottom:10px;">
        DOWN PAYMENT LEDGER
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <div style="border:1px solid #e2e8f0;padding:8px;border-radius:4px;">
          <div style="font-size:10px;color:#666;font-weight:bold;border-bottom:1px solid #1a3c6e;padding-bottom:4px;margin-bottom:6px;">CUSTOMER</div>
          <p style="font-weight:bold;">${customer.name}</p>
          <p style="color:#666;font-size:10px;">${customer.customerId} | ${customer.phone}</p>
        </div>
        <div style="border:1px solid #e2e8f0;padding:8px;border-radius:4px;">
          <div style="font-size:10px;color:#666;font-weight:bold;border-bottom:1px solid #1a3c6e;padding-bottom:4px;margin-bottom:6px;">PLOT</div>
          <p style="font-weight:bold;">Plot ${plot.plotNumber}, Block ${plot.block}</p>
          <p style="color:#666;font-size:10px;">${plot.size} ${plot.sizeUnit}</p>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px;">
        <div style="border:1px solid #e2e8f0;padding:8px;text-align:center;border-radius:4px;">
          <p style="font-size:9px;color:#666;">Total Down Payment</p>
          <p style="font-weight:bold;color:#1a3c6e;">Rs. ${formatCurrency(totalDownPayment)}</p>
        </div>
        <div style="border:1px solid #e2e8f0;padding:8px;text-align:center;border-radius:4px;">
          <p style="font-size:9px;color:#666;">Received So Far</p>
          <p style="font-weight:bold;color:#16a34a;">Rs. ${formatCurrency(bookingPaid + receivedSoFar)}</p>
        </div>
        <div style="border:1px solid #e2e8f0;padding:8px;text-align:center;border-radius:4px;background:${stillPending > 0 ? '#fef2f2' : '#dcfce7'};">
          <p style="font-size:9px;color:#666;">Still Pending</p>
          <p style="font-weight:bold;color:${stillPending > 0 ? '#b91c1c' : '#16a34a'};">Rs. ${formatCurrency(stillPending)}</p>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr>
            <th style="background:#1a3c6e;color:white;padding:5px 8px;text-align:left;">Description</th>
            <th style="background:#1a3c6e;color:white;padding:5px 8px;text-align:left;">Method</th>
            <th style="background:#1a3c6e;color:white;padding:5px 8px;text-align:right;">Amount</th>
            <th style="background:#1a3c6e;color:white;padding:5px 8px;text-align:left;">Date</th>
            <th style="background:#1a3c6e;color:white;padding:5px 8px;text-align:left;">Notes</th>
          </tr>
        </thead>
        <tbody>${txRows}</tbody>
      </table>
    `;
    printInNewWindow(html, `Down Payment Ledger — ${customer.name}`);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">{customer.name} — Down Payment Ledger</h1>
          <p className="text-sm text-slate-500">
            Plot {plot.plotNumber} Block {plot.block} &nbsp;·&nbsp; {customer.customerId}
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="card space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Total Down Payment', value: formatCurrency(totalDownPayment), color: '#1a3c6e' },
            { label: 'Booking Already Paid', value: formatCurrency(bookingPaid), color: '#64748b' },
            { label: 'Remaining Required', value: formatCurrency(remainingRequired), color: '#b45309' },
            { label: 'Received So Far (via DP)', value: formatCurrency(receivedSoFar), color: '#16a34a' },
            { label: 'Still Pending', value: formatCurrency(stillPending), color: stillPending > 0 ? '#b91c1c' : '#16a34a' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg p-3 border border-slate-200">
              <p className="text-xs text-slate-500 mb-1">{label}</p>
              <p className="text-lg font-bold" style={{ color }}>Rs. {value}</p>
            </div>
          ))}
          <div className="rounded-lg p-3 border flex flex-col justify-center items-center" style={{ borderColor: statusColor, background: statusColor + '15' }}>
            <p className="text-xs text-slate-500 mb-1">Status</p>
            <p className="font-bold text-sm" style={{ color: statusColor }}>{statusLabel}</p>
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div className="card">
        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
          <DollarSign size={18} style={{ color: '#1a3c6e' }} /> Transaction History
        </h3>

        {/* Booking entry (always first) */}
        <div className="flex items-start gap-3 p-3 rounded-lg mb-3" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center">
              <p className="font-semibold text-slate-800">Booking Amount</p>
              <p className="font-bold text-lg" style={{ color: '#1a3c6e' }}>{formatCurrency(bookingPaid)}</p>
            </div>
            <p className="text-xs text-slate-400 mt-1">Method: Cash &nbsp;·&nbsp; {formatDate(sale.saleDate)} &nbsp;·&nbsp; Auto-entry from booking</p>
          </div>
        </div>

        <div className="border-t border-dashed border-slate-200 my-3" />

        {txns.length === 0 && stillPending > 0 && (
          <div className="text-center py-6 text-slate-400 text-sm">No additional down payments received yet.</div>
        )}

        {txns.map((tx, i) => (
          <div key={tx.id}>
            <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <p className="font-semibold text-slate-800">Down Payment Received</p>
                  <p className="font-bold text-lg" style={{ color: '#16a34a' }}>{formatCurrency(tx.amount)}</p>
                </div>
                <div className="flex gap-3 text-xs text-slate-400 mt-1">
                  <span>Method: {tx.paymentMethod}{tx.bankName ? ` - ${tx.bankName}` : ''}</span>
                  <span>·</span>
                  <span>{formatDate(tx.paymentDate)}</span>
                  {tx.notes && <><span>·</span><span>{tx.notes}</span></>}
                </div>
                <div className="mt-1 text-xs">
                  <span className="text-slate-500">Receipt#: </span>
                  <span className="font-mono font-bold">{tx.receiptNumber}</span>
                </div>
              </div>
            </div>
            {i < txns.length - 1 && <div className="border-t border-dashed border-slate-200 my-3" />}
          </div>
        ))}

        {stillPending > 0 && (
          <>
            <div className="border-t border-dashed border-slate-200 my-3" />
            <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <p className="font-semibold" style={{ color: '#b91c1c' }}>Remaining Pending</p>
                  <p className="font-bold text-lg" style={{ color: '#b91c1c' }}>{formatCurrency(stillPending)}</p>
                </div>
                <p className="text-xs text-slate-400 mt-1">Due: ASAP</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {stillPending > 0 && (
          <button
            onClick={() => navigate(`/payments/receive-down-payment?saleId=${saleId}`)}
            className="btn btn-primary"
          >
            <CreditCard size={16} /> Receive Down Payment
          </button>
        )}
        <button onClick={handlePrintLedger} className="btn btn-secondary">
          <Printer size={16} /> Print Ledger
        </button>
      </div>
    </div>
  );
};

export default DownPaymentLedger;
