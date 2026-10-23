import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Handshake, BookOpenCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import StatusBadge from '../../components/ui/StatusBadge';
import ReportLayout, { exportRowsToCsv, type ReportKpi } from '../../components/reports/ReportLayout';
import ReportFilters, { type DateRange } from '../../components/ui/ReportFilters';
import { getDocument } from '../../firebase/firestore';
import { useLiveCollection } from '../../data/liveStore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { printContent, generateReportHTML } from '../../utils/printUtils';
import type {
  Dealer, DealerCommission, DealerLedgerEntry, Sale, Customer, Plot, CompanySettings,
} from '../../types';

const DealerCommissionReport: React.FC = () => {
  const navigate = useNavigate();

  const { data: dealers, loading: loadingDealers } = useLiveCollection<Dealer>('dealers');
  const { data: commissions, loading: loadingComms } = useLiveCollection<DealerCommission>('dealerCommissions');
  const { data: ledger, loading: loadingLedger } = useLiveCollection<DealerLedgerEntry>('dealerLedger');
  const { data: sales, loading: loadingSales } = useLiveCollection<Sale>('sales');
  const { data: customers, loading: loadingCust } = useLiveCollection<Customer>('customers');
  const { data: plots, loading: loadingPlots } = useLiveCollection<Plot>('plots');
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [filterDealer, setFilterDealer] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [search, setSearch] = useState('');
  const loading = loadingDealers || loadingComms || loadingLedger || loadingSales || loadingCust || loadingPlots;

  useEffect(() => {
    let active = true;
    getDocument<CompanySettings>('settings', 'company')
      .then(comp => {
        if (active && comp) setCompany(comp);
      })
      .catch(() => {});
    return () => { active = false; };
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
    resolveDealer(c)?.name || (c.dealerName as string) || '-';

  const filtered = commissions.filter(c => {
    if (filterDealer) {
      const d = resolveDealer(c);
      if (!d || d.id !== filterDealer) return false;
    }
    if (dateRange.start && new Date(c.createdAt) < dateRange.start) return false;
    if (dateRange.end && new Date(c.createdAt) > dateRange.end) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const dName = dealerName(c).toLowerCase();
      const sInfo = saleInfo(c.saleId).toLowerCase();
      if (!dName.includes(q) && !sInfo.includes(q)) return false;
    }
    return true;
  });

  const saleInfo = (saleId: string) => {
    const s = sales.find(sa => sa.id === saleId);
    if (!s) return '-';
    const p = plots.find(pl => pl.id === s.plotId);
    const c = customers.find(cu => cu.id === s.customerId);
    return `${c?.name || '?'} / Plot ${p?.plotNumber || '?'}-${p?.block || '?'}`;
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

  const totalEarned = filtered.reduce((s, c) => s + (c.commissionAmount || 0), 0);
  const totalPaid = filtered.reduce((s, c) => s + (remainingByRecord.get(c.id as string) === 0
    ? (c.commissionAmount || 0)
    : (c.commissionAmount || 0) - (remainingByRecord.get(c.id as string) || 0)), 0);
  const totalPending = totalEarned - totalPaid;

  // Per dealer summary
  const dealerSummary = dealers.map(d => {
    const dc = filtered.filter(c => resolveDealer(c)?.id === d.id);
    const total = dc.reduce((s, c) => s + (c.commissionAmount || 0), 0);
    const statusPaid = dc.filter(c => c.paymentStatus === 'paid').reduce((s, c) => s + (c.commissionAmount || 0), 0);
    const ledgerPaid = paidByDealer.get(d.name) || 0;
    return {
      dealer: d,
      total,
      paid: Math.min(total, Math.max(statusPaid, ledgerPaid)),
      count: dc.length,
    };
  }).filter(d => d.count > 0);

  const kpis: ReportKpi[] = [
    { label: 'Total Earned', value: totalEarned, isCurrency: true, color: 'navy', hint: `${filtered.length} commissions` },
    { label: 'Paid Commission', value: totalPaid, isCurrency: true, color: 'green', hint: 'Settled via ledger' },
    { label: 'Pending Commission', value: totalPending, isCurrency: true, color: 'amber', hint: 'Outstanding balance' },
    { label: 'Active Dealers', value: dealerSummary.length, color: 'blue', hint: `Of ${dealers.length} registered` },
  ];

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
    printContent(html, 'Dealer Commission Report');
  };

  const handleExportCSV = () => {
    const headers = ['Dealer', 'Sale / Plot', 'Sale Amount', 'Commission', 'Remaining', 'Status', 'Paid Date'];
    const rows = filtered.map(c => [
      dealerName(c),
      saleInfo(c.saleId),
      c.saleAmount || 0,
      c.commissionAmount || 0,
      remainingByRecord.get(c.id as string) ?? c.commissionAmount ?? 0,
      c.paymentStatus || '',
      formatDate(c.paymentDate) || '',
    ]);
    exportRowsToCsv('dealer-commission-report', headers, rows);
  };

  return (
    <ReportLayout
      reportName="Dealer Commission"
      title="Dealer Commission Report"
      subtitle="Overview of dealer commission accruals, ledger disbursements, and balances"
      icon={<Handshake size={18} />}
      kpis={kpis}
      loading={loading}
      onPrint={handlePrint}
      onExportCsv={handleExportCSV}
      filterCard={
        <ReportFilters
          search={search}
          onSearchChange={setSearch}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          searchPlaceholder="Search dealer, customer, or plot..."
          extraFilters={
            <select
              className="input-field text-xs py-2 w-48"
              value={filterDealer}
              onChange={e => setFilterDealer(e.target.value)}
            >
              <option value="">All Dealers</option>
              {dealers.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          }
        />
      }
      topContent={
        dealerSummary.length > 0 ? (
          <div className="card overflow-x-auto no-print">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800 text-sm">Per Dealer Summary</h3>
              <span className="text-xs text-slate-500 font-medium">{dealerSummary.length} active dealers</span>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Dealer</th>
                  <th className="py-2.5 px-3">Deals</th>
                  <th className="py-2.5 px-3">Total Commission</th>
                  <th className="py-2.5 px-3">Disbursed (Paid)</th>
                  <th className="py-2.5 px-3">Balance (Pending)</th>
                  <th className="py-2.5 px-3 text-right">Ledger</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dealerSummary.map(({ dealer, total, paid, count }) => (
                  <tr key={dealer.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-slate-900">{dealer.name}</td>
                    <td className="py-2.5 px-3 text-slate-600">{count}</td>
                    <td className="py-2.5 px-3 font-semibold text-primary">{formatCurrency(total)}</td>
                    <td className="py-2.5 px-3 text-emerald-600 font-medium">{formatCurrency(paid)}</td>
                    <td className="py-2.5 px-3 text-amber-600 font-bold">{formatCurrency(total - paid)}</td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => openLedger(dealer.name)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                      >
                        <BookOpenCheck size={12} /> View Ledger
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : undefined
      }
      footerContent={
        <div className="flex justify-between items-center font-bold">
          <span>Total Transactions: {filtered.length} records</span>
          <span className="text-primary">
            Earned: {formatCurrency(totalEarned)} | Paid: {formatCurrency(totalPaid)} | Pending: {formatCurrency(totalPending)}
          </span>
        </div>
      }
    >
      <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wider">Transaction Details</h3>
        <span className="text-xs text-slate-500">{filtered.length} transactions</span>
      </div>
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50/90 sticky top-0 z-10 text-slate-600 font-semibold border-b border-slate-200 backdrop-blur-sm">
          <tr>
            <th className="py-3 px-3.5">Dealer</th>
            <th className="py-3 px-3.5">Sale / Plot</th>
            <th className="py-3 px-3.5">Sale Amount</th>
            <th className="py-3 px-3.5">Commission</th>
            <th className="py-3 px-3.5">Remaining</th>
            <th className="py-3 px-3.5">Status</th>
            <th className="py-3 px-3.5">Paid Date</th>
            <th className="py-3 px-3.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-12 text-center text-slate-400">
                No commission records match your filter criteria.
              </td>
            </tr>
          ) : (
            filtered.map(c => {
              const rem = remainingByRecord.get(c.id as string) ?? c.commissionAmount;
              return (
                <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-3.5 font-medium text-slate-900">{dealerName(c)}</td>
                  <td className="py-3 px-3.5 text-slate-600 font-mono text-[11px]">{saleInfo(c.saleId)}</td>
                  <td className="py-3 px-3.5 text-slate-700">{formatCurrency(c.saleAmount)}</td>
                  <td className="py-3 px-3.5 font-semibold text-primary">{formatCurrency(c.commissionAmount)}</td>
                  <td className={`py-3 px-3.5 font-bold ${rem > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {formatCurrency(rem)}
                  </td>
                  <td className="py-3 px-3.5"><StatusBadge status={c.paymentStatus} size="sm" /></td>
                  <td className="py-3 px-3.5 text-slate-600">{formatDate(c.paymentDate) || '-'}</td>
                  <td className="py-3 px-3.5 text-right">
                    <button
                      onClick={() => openLedger((c.dealerName as string) || dealerName(c))}
                      className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-md transition-colors"
                      title="View Ledger"
                    >
                      <BookOpenCheck size={14} />
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </ReportLayout>
  );
};

export default DealerCommissionReport;