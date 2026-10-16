import React, { useEffect, useState } from 'react';
import ReportFilters, { DateRange } from '../../components/ui/ReportFilters';
import { useNavigate } from 'react-router-dom';
import { Handshake, Download, Printer, BookOpenCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';
import { getCollection, getDocument } from '../../firebase/firestore';
import { formatCurrency, formatDate, formatDateInput } from '../../utils/formatters';
import { printContent, generateReportHTML } from '../../utils/printUtils';
import type {
  Dealer, DealerCommission, DealerLedgerEntry, Sale, Customer, Plot, CompanySettings,
} from '../../types';

const DealerCommissionReport: React.FC = () => {
  const navigate = useNavigate();

  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [commissions, setCommissions] = useState<DealerCommission[]>([]);
  const [ledger, setLedger] = useState<DealerLedgerEntry[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [filterDealer, setFilterDealer] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [search, setSearch] = useState('');
  
  useEffect(() => {
    Promise.all([
      getCollection<Dealer>('dealers'),
      getCollection<DealerCommission>('dealerCommissions'),
      getCollection<DealerLedgerEntry>('dealerLedger'),
      getCollection<Sale>('sales'),
      getCollection<Customer>('customers'),
      getCollection<Plot>('plots'),
      getDocument<CompanySettings>('settings', 'company'),
    ]).then(([d, dc, l, s, c, p, comp]) => {
      setDealers(d); setCommissions(dc); setLedger(l);
      setSales(s); setCustomers(c); setPlots(p);
      if (comp) setCompany(comp);
    });
  }, []);

  // Records store dealerName (sometimes with empty dealerId) — resolve to a dealer object
  const resolveDealer = (c: DealerCommission): Dealer | undefined => {
    const byId = c.dealerId ? dealers.find(d => d.id === c.dealerId) : undefined;
    if (byId) return byId;
    const byName = (c.dealerName as string) || '';
    return dealers.find(d =>
      d.name.trim().toLowerCase() === byName.trim().toLowerCase());
  };

  const dealerName = (c: DealerCommission) =>
    resolveDealer(c)?.name || (c.dealerName as string) || '—';

  const filtered = commissions.filter(c => {
    if (filterDealer) {
      const d = resolveDealer(c);
      if (!d || d.id !== filterDealer) return false;
    }
    if (dateRange.start && new Date(c.createdAt) < dateRange.start) return false;
    if (dateRange.end && new Date(c.createdAt) > dateRange.end) return false;
    return true;
  });

  const saleInfo = (saleId: string) => {
    const s = sales.find(sa => sa.id === saleId);
    if (!s) return '—';
    const p = plots.find(pl => pl.id === s.plotId);
    const c = customers.find(cu => cu.id === s.customerId);
    return `${c?.name || '?'} · ${p?.plotNumber || '?'}-${p?.block || '?'}`;
  };

  const openLedger = (name: string) => {
    navigate(`/dealers/commission?dealerName=${encodeURIComponent(name)}`);
  };

  // Actual payments per dealer from the ledger (source of truth)
  const paidByDealer = (() => {
    const map = new Map<string, number>();
    ledger.forEach(e => {
      if (e.type !== 'payment_made') return;
      map.set(e.dealerName, (map.get(e.dealerName) || 0) + (e.amount || 0));
    });
    return map;
  })();

  // Remaining per commission record (FIFO allocation of ledger payments)
  const remainingByRecord = (() => {
    const map = new Map<string, number>();
    const byDealer = new Map<string, DealerCommission[]>();
    commissions.forEach(c => {
      const n = (c.dealerName as string) || 'Unknown';
      if (!byDealer.has(n)) byDealer.set(n, []);
      byDealer.get(n)!.push(c);
    });
    byDealer.forEach(records => {
      const name = (records[0]?.dealerName as string) || '';
      let pool = paidByDealer.get(name) || 0;
      records.forEach(r => {
        if (r.paymentStatus === 'paid') map.set(r.id as string, 0);
      });
      const pending = [...records]
        .filter(r => r.paymentStatus !== 'paid')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      pending.forEach(r => {
        const amt = r.commissionAmount || 0;
        const applied = Math.min(amt, Math.max(0, pool));
        map.set(r.id as string, amt - applied);
        pool -= applied;
      });
    });
    return map;
  })();

  const totalEarned = filtered.reduce((s, c) => s + c.commissionAmount, 0);
  const totalPaid = filtered.reduce((s, c) => s + (remainingByRecord.get(c.id as string) === 0
    ? (c.commissionAmount || 0)
    : (c.commissionAmount || 0) - (remainingByRecord.get(c.id as string) || 0)), 0);
  const totalPending = totalEarned - totalPaid;

  // Per dealer summary
  const dealerSummary = dealers.map(d => {
    const dc = filtered.filter(c => resolveDealer(c)?.id === d.id);
    const total = dc.reduce((s, c) => s + c.commissionAmount, 0);
    const statusPaid = dc.filter(c => c.paymentStatus === 'paid').reduce((s, c) => s + c.commissionAmount, 0);
    const ledgerPaid = paidByDealer.get(d.name) || 0;
    return {
      dealer: d,
      total,
      paid: Math.min(total, Math.max(statusPaid, ledgerPaid)),
      count: dc.length,
    };
  }).filter(d => d.count > 0);

  const handlePrint = () => {
    if (!company) { toast.error('Configure company settings'); return; }
    const rows = filtered.map(c => [
      dealerName(c), saleInfo(c.saleId), formatCurrency(c.saleAmount),
      formatCurrency(c.commissionAmount),
      formatCurrency(remainingByRecord.get(c.id as string) ?? c.commissionAmount),
      c.paymentStatus, formatDate(c.paymentDate),
    ]);
    const html = generateReportHTML(
      company, 'Dealer Commission Report',
      ['Dealer', 'Sale', 'Sale Amount', 'Commission', 'Remaining', 'Status', 'Paid Date'],
      rows,
      `Total: ${formatCurrency(totalEarned)} | Paid: ${formatCurrency(totalPaid)} | Pending: ${formatCurrency(totalPending)}`,
    );
    printContent(html, 'Report');
  };

  return (
    <div>
      <PageHeader
        title="Dealer Commission Report"
        icon={<Handshake size={20} />}
      />
      <ReportFilters 
        search={search}
        onSearchChange={setSearch}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        actions={<>
            <select className="input-field w-40" value={filterDealer} onChange={e => setFilterDealer(e.target.value)}>
              <option value="">All Dealers</option>
              {dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            
            
            
            <button onClick={handlePrint} className="btn-primary"><Printer size={15} /> Print</button>
            
          </>}
      />

      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="card text-center"><p className="text-xl font-bold text-primary">{formatCurrency(totalEarned)}</p><p className="text-xs text-slate-500 mt-1">Total Earned</p></div>
        <div className="card text-center"><p className="text-xl font-bold text-green-600">{formatCurrency(totalPaid)}</p><p className="text-xs text-slate-500 mt-1">Paid</p></div>
        <div className="card text-center"><p className="text-xl font-bold text-amber-600">{formatCurrency(totalPending)}</p><p className="text-xs text-slate-500 mt-1">Pending</p></div>
      </div>

      {/* Per dealer summary */}
      {dealerSummary.length > 0 && (
        <div className="card mb-5 no-print">
          <h3 className="font-semibold text-slate-700 mb-3">Per Dealer Summary</h3>
          <table className="w-full">
            <thead className="bg-slate-50"><tr>{['Dealer', 'Sales', 'Total Commission', 'Paid', 'Pending', ''].map(h => <th key={h} className="table-th">{h}</th>)}</tr></thead>
            <tbody>
              {dealerSummary.map(({ dealer, total, paid, count }) => (
                <tr key={dealer.id} className="table-row">
                  <td className="table-td font-medium">{dealer.name}</td>
                  <td className="table-td">{count}</td>
                  <td className="table-td font-semibold text-primary">{formatCurrency(total)}</td>
                  <td className="table-td text-green-600">{formatCurrency(paid)}</td>
                  <td className="table-td text-amber-600">{formatCurrency(total - paid)}</td>
                  <td className="table-td text-right">
                    <button onClick={() => openLedger(dealer.name)} className="btn btn-secondary btn-sm">
                      <BookOpenCheck size={13} /> Ledger
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail */}
      <div className="card overflow-x-auto">
        <h3 className="font-semibold text-slate-700 mb-3">Transaction Details</h3>
        <table className="w-full">
          <thead className="bg-slate-50"><tr>{['Dealer', 'Sale', 'Sale Amount', 'Commission', 'Remaining', 'Status', 'Paid Date', ''].map(h => <th key={h} className="table-th">{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map(c => {
              const rem = remainingByRecord.get(c.id as string) ?? c.commissionAmount;
              return (
                <tr key={c.id} className="table-row">
                  <td className="table-td font-medium">{dealerName(c)}</td>
                  <td className="table-td text-xs">{saleInfo(c.saleId)}</td>
                  <td className="table-td">{formatCurrency(c.saleAmount)}</td>
                  <td className="table-td font-semibold text-primary">{formatCurrency(c.commissionAmount)}</td>
                  <td className={`table-td font-bold ${rem > 0 ? 'text-amber-600' : 'text-green-600'}`}>{formatCurrency(rem)}</td>
                  <td className="table-td"><StatusBadge status={c.paymentStatus} size="sm" /></td>
                  <td className="table-td">{formatDate(c.paymentDate)}</td>
                  <td className="table-td text-right">
                    <button
                      onClick={() => openLedger((c.dealerName as string) || dealerName(c))}
                      className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600"
                      title="View Ledger"
                    >
                      <BookOpenCheck size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="table-td text-center py-10 text-slate-400">No commission records</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DealerCommissionReport;