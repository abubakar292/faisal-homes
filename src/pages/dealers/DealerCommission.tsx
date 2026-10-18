import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { DollarSign, Save, ArrowLeft, Plus, Printer, CreditCard, Search, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import FormField from '../../components/ui/FormField';
import DataTable, { Column } from '../../components/ui/DataTable';
import StatusBadge from '../../components/ui/StatusBadge';
import Modal from '../../components/ui/Modal';
import {
  getCollection, addDocument, updateDocument, subscribeCollection, getDocument
} from '../../firebase/firestore';
import {
  formatCurrency, formatDate, formatDateTime, formatDateInput, parseDateInput,
} from '../../utils/formatters';
import { printContent, generateReportHTML } from '../../utils/printUtils';
import type { DealerCommission as DC, DealerLedgerEntry, Sale, Plot, Customer, CompanySettings } from '../../types';
import { BrandLoader } from '../../components/brand';

// ─────────────────────────────────────────────────────────────────────────────
// DEALER LEDGER VIEW
// ─────────────────────────────────────────────────────────────────────────────
interface LedgerProps {
  dealerName: string;
  dealerPhone: string;
  onBack: () => void;
}

const DealerLedgerView: React.FC<LedgerProps> = ({ dealerName, dealerPhone, onBack }) => {
  const [entries,  setEntries]  = useState<DealerLedgerEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showPay,  setShowPay]  = useState(false);
  const [payForm,  setPayForm]  = useState({
    amount: '',
    paymentMethod: 'Cash',
    paymentDate: formatDateInput(new Date()),
    note: '',
    bankName: '',
    chequeNumber: '',
  });
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeCollection<DealerLedgerEntry>('dealerLedger', (all) => {
      const mine = all
        .filter(e => e.dealerName === dealerName)
        .sort((a, b) => {
          const d = new Date(a.date).getTime() - new Date(b.date).getTime();
          if (d !== 0) return d;
          const c = (a.createdAt?.getTime?.() ?? 0) - (b.createdAt?.getTime?.() ?? 0);
          return c;
        });
      let running = 0;
      const withBalance = mine.map(e => {
        running += e.type === 'commission_earned' ? e.amount : -e.amount;
        return { ...e, runningBalance: running };
      });
      setEntries(withBalance);
      setLoading(false);
    });
    return () => unsub();
  }, [dealerName]);

  const totalEarned  = entries.filter(e => e.type === 'commission_earned').reduce((s, e) => s + e.amount, 0);
  const totalPaid    = entries.filter(e => e.type === 'payment_made').reduce((s, e) => s + e.amount, 0);
  const balanceDue   = totalEarned - totalPaid;

  const handlePayCommission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payForm.amount || Number(payForm.amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if ((payForm.paymentMethod === 'Bank Transfer' || payForm.paymentMethod === 'Cheque') && !payForm.bankName.trim()) {
      toast.error('Bank name is required for Bank Transfer/Cheque');
      return;
    }
    if (payForm.paymentMethod === 'Cheque' && !payForm.chequeNumber.trim()) {
      toast.error('Cheque number is required');
      return;
    }
    try {
      setPaying(true);
      // Calculate running balance before this payment
      const currentBalance = entries.length > 0
        ? entries[entries.length - 1].runningBalance
        : totalEarned - totalPaid;
      const newRunningBalance = currentBalance - Number(payForm.amount);

      const entry: Omit<DealerLedgerEntry, 'id'> = {
        dealerName,
        dealerPhone,
        type:          'payment_made',
        amount:        Number(payForm.amount),
        runningBalance: newRunningBalance,
        paymentMethod: payForm.paymentMethod,
        bankName:      payForm.bankName.trim(),
        chequeNumber:  payForm.chequeNumber.trim(),
        note:          payForm.note.trim(),
        date:          parseDateInput(payForm.paymentDate) || new Date(),
        createdAt:     new Date(),
      };
      await addDocument('dealerLedger', entry);
      toast.success(`✅ Payment of ${formatCurrency(Number(payForm.amount))} recorded`);
      setShowPay(false);
      setPayForm({ amount: '', paymentMethod: 'Cash', paymentDate: formatDateInput(new Date()), note: '', bankName: '', chequeNumber: '' });
    } catch {
      toast.error('Failed to record payment');
    } finally {
      setPaying(false);
    }
  };

  const handlePrint = async () => {
    const comp = await getDocument<CompanySettings>('settings', 'company');
    if (!comp) { toast.error('Configure company settings'); return; }
    
    const rows = entries.map(e => [
      formatDate(e.date),
      e.type === 'commission_earned' ? 'Commission Earned' : 'Payment Made',
      e.plotInfo || '—',
      e.type === 'commission_earned' ? formatCurrency(e.amount) : '—',
      e.type === 'payment_made' ? formatCurrency(e.amount) : '—',
      formatCurrency(e.runningBalance)
    ]);
    
    const html = generateReportHTML(
      comp,
      `Dealer Ledger — ${dealerName}`,
      ['Date', 'Type', 'Sale', 'Earned', 'Paid', 'Balance'],
      rows,
      `Total Earned: ${formatCurrency(totalEarned)} | Total Paid: ${formatCurrency(totalPaid)} | Balance Pending: ${formatCurrency(balanceDue)}`
    );
    printContent(html, `DealerLedger-${dealerName}`);
  };

  return (
    <div>
      <PageHeader
        title={`${dealerName} — Commission Ledger`}
        subtitle={dealerPhone || 'Dealer ledger history'}
        icon={<DollarSign size={20} />}
        actions={
          <div className="flex gap-2">
            <button onClick={onBack} className="btn btn-secondary btn-sm">
              <ArrowLeft size={14} /> Back
            </button>
            <button onClick={() => setShowPay(true)} className="btn btn-primary btn-sm">
              <Plus size={14} /> Pay Commission
            </button>
            <button onClick={handlePrint} className="btn btn-secondary btn-sm no-print">
              <Printer size={14} /> Print
            </button>
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-5">
        {[
          { label: 'Total Commission Earned', value: formatCurrency(totalEarned), color: '#1a3c6e', bg: '#eff6ff' },
          { label: 'Total Received',           value: formatCurrency(totalPaid),   color: '#15803d', bg: '#dcfce7' },
          { label: 'Balance Pending',          value: formatCurrency(balanceDue),  color: '#b91c1c', bg: '#fee2e2' },
        ].map(item => (
          <div key={item.label} className="card text-center" style={{ background: item.bg, border: 'none' }}>
            <p className="text-2xl font-extrabold" style={{ color: item.color }}>{item.value}</p>
            <p className="text-xs text-slate-500 mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Transaction history */}
      <div className="card" id="print-area">
        <h3 className="font-bold text-primary text-sm mb-4">Transaction History</h3>
        {loading ? (
          <BrandLoader />
        ) : entries.length === 0 ? (
          <p className="text-center py-8 text-slate-400 text-sm">No transactions yet</p>
        ) : (
          <div className="space-y-3">
            {entries.map(entry => (
              <div
                key={entry.id}
                className="flex items-start justify-between p-4 rounded-xl border"
                style={entry.type === 'commission_earned'
                  ? { background: '#eff6ff', borderColor: '#bfdbfe' }
                  : { background: '#dcfce7', borderColor: '#86efac' }
                }
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                    style={entry.type === 'commission_earned'
                      ? { background: '#dbeafe' }
                      : { background: '#bbf7d0' }
                    }
                  >
                    {entry.type === 'commission_earned' ? '💰' : '✅'}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold" style={{ color: entry.type === 'commission_earned' ? '#1d4ed8' : '#15803d' }}>
                        {entry.type === 'commission_earned' ? 'Commission Earned' : 'Payment Made to Dealer'}
                      </p>
                      <span className="text-[11px] text-slate-400">
                        {formatDate(entry.date)} <span className="opacity-60">&middot;</span> {formatDateTime(entry.createdAt)}
                      </span>
                    </div>
                    {entry.plotInfo && (
                      <p className="text-xs text-slate-600 mt-0.5">Sale: {entry.plotInfo}</p>
                    )}
                    {entry.paymentMethod && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        Method: {entry.paymentMethod}
                        {entry.bankName && ` — ${entry.bankName}`}
                        {entry.chequeNumber && ` (Cheque: ${entry.chequeNumber})`}
                      </p>
                    )}
                    {entry.note && (
                      <p className="text-xs text-slate-500 mt-0.5 italic">Note: {entry.note}</p>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <p className="text-lg font-extrabold"
                    style={{ color: entry.type === 'commission_earned' ? '#1d4ed8' : '#15803d' }}>
                    {entry.type === 'commission_earned' ? '+' : '−'}{formatCurrency(entry.amount)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Balance: {formatCurrency(entry.runningBalance)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Running balance footer */}
        {entries.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-center">
            <span className="text-sm font-bold text-slate-700">Balance Due to Dealer</span>
            <span className="text-xl font-extrabold" style={{ color: balanceDue > 0 ? '#b91c1c' : '#15803d' }}>
              {formatCurrency(balanceDue)}
            </span>
          </div>
        )}
      </div>

      {/* Pay Commission Modal */}
      <Modal isOpen={showPay} onClose={() => setShowPay(false)} title={`Pay Commission — ${dealerName}`} size="sm">
        <form onSubmit={handlePayCommission} className="space-y-4">
          <FormField label="Amount to Pay (Rs.)" required>
            <input
              className="input-field font-semibold"
              type="number"
              value={payForm.amount}
              onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
              placeholder={`Max: ${formatCurrency(balanceDue)}`}
              min="0"
              max={balanceDue}
              style={{ color: '#1a3c6e' }}
            />
            {balanceDue > 0 && (
              <p className="text-xs text-slate-400 mt-1">Balance pending: {formatCurrency(balanceDue)}</p>
            )}
          </FormField>

          <FormField label="Payment Method">
            <select className="input-field" value={payForm.paymentMethod}
              onChange={e => setPayForm(f => ({ ...f, paymentMethod: e.target.value, bankName: '', chequeNumber: '' }))}>
              {['Cash', 'Bank Transfer', 'Cheque'].map(m => <option key={m}>{m}</option>)}
            </select>
          </FormField>

          {(payForm.paymentMethod === 'Bank Transfer' || payForm.paymentMethod === 'Cheque') && (
            <FormField label="Bank Name" required>
              <input className="input-field" value={payForm.bankName}
                onChange={e => setPayForm(f => ({ ...f, bankName: e.target.value }))}
                placeholder="e.g., HBL, UBL, MCB" />
            </FormField>
          )}

          {payForm.paymentMethod === 'Cheque' && (
            <FormField label="Cheque Number" required>
              <input className="input-field" value={payForm.chequeNumber}
                onChange={e => setPayForm(f => ({ ...f, chequeNumber: e.target.value }))}
                placeholder="Cheque #" />
            </FormField>
          )}

          <FormField label="Payment Date">
            <input className="input-field" type="date" value={payForm.paymentDate}
              onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))} />
          </FormField>

          <FormField label="Note (Optional)">
            <input className="input-field" value={payForm.note}
              onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))}
              placeholder="e.g., Partial payment" />
          </FormField>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={paying} className="btn btn-primary flex-1 justify-center">
              <CreditCard size={15} /> {paying ? 'Recording...' : 'Record Payment'}
            </button>
            <button type="button" onClick={() => setShowPay(false)} className="btn btn-secondary flex-1 justify-center">
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DEALER COMMISSION PAGE
// ─────────────────────────────────────────────────────────────────────────────
const DealerCommission: React.FC = () => {
  const [commissions, setCommissions] = useState<DC[]>([]);
  const [sales,       setSales]       = useState<Sale[]>([]);
  const [plots,       setPlots]       = useState<Plot[]>([]);
  const [customers,   setCustomers]   = useState<Customer[]>([]);
  const [ledger,      setLedger]      = useState<DealerLedgerEntry[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [ledgerDealer, setLedgerDealer] = useState<{ name: string; phone: string } | null>(null);
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const loadStatic = async () => {
      setLoading(true);
      const [s, p, c] = await Promise.all([
        getCollection<Sale>('sales'),
        getCollection<Plot>('plots'),
        getCollection<Customer>('customers'),
      ]);
      setSales(s);
      setPlots(p);
      setCustomers(c);
      setLoading(false);
    };
    loadStatic();

    const unsubComms = subscribeCollection<DC>('dealerCommissions', (dc) => {
      setCommissions(dc.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    });
    
    const unsubLedger = subscribeCollection<DealerLedgerEntry>('dealerLedger', (l) => {
      setLedger(l);
    });

    return () => {
      unsubComms();
      unsubLedger();
    };
  }, []);

  // Open ledger from another page via ?dealerName=<name>
  useEffect(() => {
    const name = searchParams.get('dealerName');
    if (name) setLedgerDealer({ name, phone: '' });
  }, [searchParams]);

  const markPaid = async (commId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await updateDocument('dealerCommissions', commId, {
      paymentStatus: 'paid',
      paymentDate:   new Date(),
    });
    toast.success('Marked as paid');
  };

  const plotInfo = (plotId: string) => {
    const p = plots.find(pl => pl.id === plotId);
    return p ? `${p.plotNumber} B${p.block}` : '—';
  };
  const custName = (custId: string) => customers.find(c => c.id === custId)?.name || '—';

  // ── If viewing ledger ──
  if (ledgerDealer) {
    return (
      <DealerLedgerView
        dealerName={ledgerDealer.name}
        dealerPhone={ledgerDealer.phone}
        onBack={() => setLedgerDealer(null)}
      />
    );
  }

  // Actual payments per dealer from the ledger (source of truth)
  const paidByDealer = (() => {
    const map = new Map<string, number>();
    ledger.forEach(e => {
      if (e.type !== 'payment_made') return;
      map.set(e.dealerName, (map.get(e.dealerName) || 0) + (e.amount || 0));
    });
    return map;
  })();

  // Remaining amount per commission record (FIFO allocation of ledger payments)
  const remainingByRecord = (() => {
    const map   = new Map<string, number>();
    const byDealer = new Map<string, DC[]>();
    commissions.forEach(c => {
      const name = (c.dealerName as string) || 'Unknown';
      if (!byDealer.has(name)) byDealer.set(name, []);
      byDealer.get(name)!.push(c);
    });
    byDealer.forEach(records => {
      const dealerName = (records[0]?.dealerName as string) || '';
      let pool = paidByDealer.get(dealerName) || 0;
      records.forEach(r => {
        if ((r.paymentStatus as string) === 'paid') map.set(r.id as string, 0);
      });
      const pending = [...records]
        .filter(r => (r.paymentStatus as string) !== 'paid')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      pending.forEach(r => {
        const amount  = r.commissionAmount || 0;
        const applied = Math.min(amount, Math.max(0, pool));
        map.set(r.id as string, amount - applied);
        pool -= applied;
      });
    });
    return map;
  })();

  const columns: Column<DC>[] = [
    {
      key: 'dealerName', label: 'Dealer',
      render: r => (
        <div>
          <p className="font-semibold text-primary">{(r.dealerName as string) || '—'}</p>
          {(r.dealerPhone as string) && (
            <p className="text-[11px] text-slate-400">{r.dealerPhone as string}</p>
          )}
        </div>
      ),
    },
    {
      key: 'saleId', label: 'Sale / Plot',
      render: r => {
        const s = sales.find(sa => sa.id === r.saleId);
        return s
          ? <span className="text-xs">{plotInfo(s.plotId)}<br/><span className="text-slate-400">{custName(s.customerId)}</span></span>
          : '—';
      },
    },
    {
      key: 'saleAmount', label: 'Sale Amount',
      render: r => formatCurrency(r.saleAmount as number),
    },
    {
      // NEW: Down Payment column
      key: 'downPayment', label: 'Down Payment',
      render: r => {
        const dp = (r.downPayment as number) || 0;
        const pct = r.saleAmount ? ((dp / (r.saleAmount as number)) * 100).toFixed(1) : '0';
        return (
          <div>
            <p className="font-semibold text-slate-700">{formatCurrency(dp)}</p>
            <p className="text-[11px] text-slate-400">{pct}% of total</p>
          </div>
        );
      },
    },
    {
      key: 'commissionAmount', label: 'Commission',
      render: r => (
        <div>
          <p className="font-bold text-primary">{formatCurrency(r.commissionAmount as number)}</p>
          {(r.commissionPercent as number) > 0 && (
            <p className="text-[11px] text-slate-400">{r.commissionPercent as number}%</p>
          )}
        </div>
      ),
    },
    {
      key: 'remaining', label: 'Remaining',
      render: r => {
        const rem = remainingByRecord.get(r.id as string)
          ?? ((r.paymentStatus as string) === 'paid' ? 0 : (r.commissionAmount || 0));
        return (
          <span className={`font-bold ${rem > 0 ? 'text-red-500' : 'text-green-600'}`}>
            {formatCurrency(rem)}
          </span>
        );
      },
    },
    {
      key: 'paymentStatus', label: 'Status',
      render: r => <StatusBadge status={r.paymentStatus as string} />,
    },
    {
      key: 'paymentDate', label: 'Paid Date',
      render: r => formatDate(r.paymentDate as Date),
    },
    {
      key: 'actions', label: 'Actions', sortable: false,
      render: r => (
        <div className="flex gap-1 row-actions">
          {(r.paymentStatus as string) === 'pending' && (
            <button
              onClick={(e) => markPaid(r.id as string, e)}
              className="btn btn-success btn-sm"
            >
              Mark Paid
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLedgerDealer({
                name:  (r.dealerName as string) || '',
                phone: (r.dealerPhone as string) || '',
              });
            }}
            className="btn btn-secondary btn-sm"
          >
            Ledger
          </button>
        </div>
      ),
    },
  ];

  // Summary per dealer
  const dealerSummary = (() => {
    const map = new Map<string, { name: string; phone: string; total: number; paid: number; count: number }>();
    commissions.forEach(c => {
      const name = (c.dealerName as string) || 'Unknown';
      const existing = map.get(name) || { name, phone: (c.dealerPhone as string) || '', total: 0, paid: 0, count: 0 };
      existing.total += c.commissionAmount || 0;
      existing.count++;
      map.set(name, existing);
    });
    map.forEach(v => {
      const statusPaid = commissions
        .filter(c => (c.dealerName as string) === v.name && c.paymentStatus === 'paid')
        .reduce((s, c) => s + (c.commissionAmount || 0), 0);
      const ledgerPaid = paidByDealer.get(v.name) || 0;
      v.paid = Math.min(v.total, Math.max(statusPaid, ledgerPaid));
    });
    return Array.from(map.values());
  })();

  return (
    <div>
      <PageHeader
        title="Dealer Commission"
        subtitle="Commission records — click a row to view dealer ledger"
        icon={<DollarSign size={20} />}
      />

      {/* Dealer summary cards */}
      {dealerSummary.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
          {dealerSummary.map(d => (
            <div
              key={d.name}
              className="card cursor-pointer hover:-translate-y-0.5 transition-all"
              onClick={() => setLedgerDealer({ name: d.name, phone: d.phone })}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-bold text-primary text-sm">{d.name}</p>
                  {d.phone && <p className="text-xs text-slate-400">{d.phone}</p>}
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: '#eff6ff', color: '#1d4ed8' }}>
                  {d.count} sales
                </span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Earned</span>
                  <span className="font-bold text-primary">{formatCurrency(d.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Paid</span>
                  <span className="font-semibold text-green-600">{formatCurrency(d.paid)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Pending</span>
                  <span className="font-semibold text-red-500">{formatCurrency(d.total - d.paid)}</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Click to view ledger →</p>
            </div>
          ))}
        </div>
      )}

      {/* Commission table */}
      <div className="card">
        <h3 className="font-bold text-primary text-sm mb-3">
          Commission Records
          <span className="ml-2 text-xs font-normal text-slate-400">Click any row to open dealer ledger</span>
        </h3>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by dealer name, customer name, plot..."
            className="input-field pl-9 pr-8"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>
        <DataTable
          columns={columns}
          data={(() => {
            const q = searchQuery.toLowerCase().trim();
            if (!q) return commissions;
            return commissions.filter(c => {
              const sale = sales.find(s => s.id === c.saleId);
              const customer = sale ? customers.find(cu => cu.id === sale.customerId) : null;
              const plot = sale ? plots.find(p => p.id === sale.plotId) : null;
              return (
                ((c.dealerName as string) || '').toLowerCase().includes(q) ||
                (customer?.name || '').toLowerCase().includes(q) ||
                (customer?.customerId || '').toLowerCase().includes(q) ||
                (plot?.plotNumber || '').toLowerCase().includes(q) ||
                (plot?.block || '').toLowerCase().includes(q)
              );
            });
          })()}
          keyField="id"
          loading={loading}
          emptyMessage="No commission records yet"
          onRowClick={row =>
            setLedgerDealer({
              name:  (row.dealerName as string) || '',
              phone: (row.dealerPhone as string) || '',
            })
          }
        />
      </div>
    </div>
  );
};

export default DealerCommission;
