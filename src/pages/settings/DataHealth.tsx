import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  ShieldCheck,
  Search,
  ExternalLink,
  BookOpen,
  Eye,
  Info,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { useLiveCollection } from '../../data/liveStore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { expectedCounts, PlanInput } from '../../domain/plan';
import type { Sale, Customer, Plot, Installment } from '../../types';

interface InconsistentSaleItem {
  sale: Sale;
  customer?: Customer;
  plot?: Plot;
  expectedCount: number;
  actualCount: number;
  expectedTotal: number;
  actualTotal: number;
  unpaidDocsTotal: number;
  saleRemaining: number;
  expectedDp: number;
  actualDpSum: number;
  issues: string[];
}

export const DataHealth: React.FC = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = React.useState('');

  const { data: sales, loading: l1 } = useLiveCollection<Sale>('sales');
  const { data: customers, loading: l2 } = useLiveCollection<Customer>('customers');
  const { data: plots, loading: l3 } = useLiveCollection<Plot>('plots');
  const { data: installments, loading: l4 } = useLiveCollection<Installment>('installments');

  const loading = l1 || l2 || l3 || l4;

  if (!isAdmin) {
    return (
      <div className="p-8 text-center card bg-white border border-slate-200 rounded-xl space-y-2">
        <ShieldCheck size={36} className="text-slate-400 mx-auto" />
        <h3 className="font-bold text-slate-800 text-sm">Access Restricted</h3>
        <p className="text-xs text-slate-500">
          The Data Health audit is restricted to administrators.
        </p>
      </div>
    );
  }

  const activeSales = useMemo(() => {
    return sales.filter(s => s.status !== 'cancelled');
  }, [sales]);

  const auditResults = useMemo(() => {
    const list: InconsistentSaleItem[] = [];

    for (const sale of activeSales) {
      const cust = customers.find(c => c.id === sale.customerId);
      const plot = plots.find(p => p.id === sale.plotId);
      const saleInsts = installments.filter(
        i => i.saleId === sale.id && i.type !== 'down_payment'
      );

      const rows = Array.isArray(sale.installmentRows) && sale.installmentRows.length > 0
        ? sale.installmentRows
        : [];

      const planInput: PlanInput = {
        saleId: sale.id,
        customerId: sale.customerId,
        plotId: sale.plotId,
        saleDate: sale.saleDate || new Date(),
        totalPrice: sale.totalPrice || sale.finalPrice || 0,
        discount: sale.discount || 0,
        bookingPaid: sale.bookingAmountPaid || 0,
        downPaymentAmount: sale.downPaymentAmount || sale.downPayment || 0,
        rows,
        semiAnnualEnabled: !!sale.semiAnnualEnabled,
        semiAnnualAmount: sale.semiAnnualAmount || 0,
        onPossessionEnabled: !!sale.onPossessionEnabled,
        onPossessionAmount: sale.onPossessionAmount || 0,
        includeRemainingDownPayment: false,
      };

      const exp = expectedCounts(planInput);
      const expectedTotal = exp.amountToSchedule + exp.possessionAmount;
      const actualTotal = saleInsts.reduce((sum, i) => sum + (i.amountDue || 0), 0);
      const unpaidDocsTotal = saleInsts
        .filter(i => i.status !== 'paid')
        .reduce((sum, i) => sum + (i.amountDue - (i.amountPaid || 0)), 0);
      const saleRemaining = sale.remainingAmount || 0;

      const expectedDp = sale.downPaymentAmount || sale.downPayment || 0;
      const actualDpSum = (sale.downPaymentReceived || 0) + (sale.remainingDownPayment || 0);

      const issues: string[] = [];

      // Check 1: Document count differs
      if (saleInsts.length !== exp.totalCount) {
        issues.push(
          `Document count mismatch (expected ${exp.totalCount}, actual in database ${saleInsts.length})`
        );
      }

      // Check 2: Total of documents differs from amount to schedule
      if (Math.abs(actualTotal - expectedTotal) > 1) {
        issues.push(
          `Scheduled total mismatch (expected Rs ${expectedTotal.toLocaleString('en-PK')}, actual Rs ${actualTotal.toLocaleString('en-PK')})`
        );
      }

      // Check 3: Remaining amount differs from unpaid documents
      if (Math.abs(unpaidDocsTotal - saleRemaining) > 1) {
        issues.push(
          `Remaining balance mismatch (sale record Rs ${saleRemaining.toLocaleString('en-PK')}, unpaid docs Rs ${unpaidDocsTotal.toLocaleString('en-PK')})`
        );
      }

      // Check 4: Down payment integrity
      if (Math.abs(actualDpSum - expectedDp) > 1) {
        issues.push(
          `Down payment mismatch (expected Rs ${expectedDp.toLocaleString('en-PK')}, received+remaining Rs ${actualDpSum.toLocaleString('en-PK')})`
        );
      }

      if (issues.length > 0) {
        list.push({
          sale,
          customer: cust,
          plot,
          expectedCount: exp.totalCount,
          actualCount: saleInsts.length,
          expectedTotal,
          actualTotal,
          unpaidDocsTotal,
          saleRemaining,
          expectedDp,
          actualDpSum,
          issues,
        });
      }
    }

    return list;
  }, [activeSales, customers, plots, installments]);

  const filteredInconsistent = useMemo(() => {
    if (!searchTerm.trim()) return auditResults;
    const term = searchTerm.toLowerCase();
    return auditResults.filter(
      item =>
        item.customer?.name.toLowerCase().includes(term) ||
        item.customer?.customerId?.toLowerCase().includes(term) ||
        item.plot?.plotNumber.toLowerCase().includes(term) ||
        item.sale.saleNumber?.toLowerCase().includes(term)
    );
  }, [auditResults, searchTerm]);

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Data Health & Schedule Consistency Audit"
        subtitle="Read-only integrity check for sales, installment schedules, and ledger reconciliation"
        icon={<Activity size={22} className="text-[#1a3c6e]" />}
      />

      {/* Notice Banner */}
      <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-start gap-3">
        <Info size={18} className="text-[#1a3c6e] flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">
            System Data Health Policy (Strict Integrity Mode)
          </p>
          <p className="text-blue-800">
            This report audits all active sales in real time against the contract. No automated repair
            scripts modify real customer financial data. If an older sale was created with an incomplete
            or truncated schedule, cancel or delete the sale in Sales List and re-enter it with the correct plan.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4 bg-white border border-slate-200 rounded-xl space-y-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Active Sales
          </span>
          <p className="text-2xl font-bold text-slate-800">{activeSales.length}</p>
        </div>
        <div className="card p-4 bg-white border border-slate-200 rounded-xl space-y-1">
          <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle size={14} /> Healthy Schedules
          </span>
          <p className="text-2xl font-bold text-emerald-700">
            {Math.max(0, activeSales.length - auditResults.length)}
          </p>
        </div>
        <div className="card p-4 bg-white border border-slate-200 rounded-xl space-y-1">
          <span className="text-xs font-semibold text-rose-600 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle size={14} /> Inconsistent Sales
          </span>
          <p className="text-2xl font-bold text-rose-700">{auditResults.length}</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-2 max-w-md bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs">
        <Search size={14} className="text-slate-400" />
        <input
          type="text"
          className="w-full outline-none bg-transparent"
          placeholder="Filter by customer, plot, or sale number..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Results Table / Cards */}
      {loading ? (
        <div className="p-8 text-center text-slate-400 text-sm">
          Auditing database records...
        </div>
      ) : filteredInconsistent.length === 0 ? (
        <div className="p-8 text-center card bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-2">
          <ShieldCheck size={36} className="text-emerald-600 mx-auto" />
          <h3 className="font-bold text-emerald-900 text-sm">All Schedules Consistent</h3>
          <p className="text-xs text-emerald-700">
            Every active plot sale matches its expected installment document count and required allocation.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Inconsistent Sales Requiring Review ({filteredInconsistent.length})
          </h4>

          <div className="space-y-3">
            {filteredInconsistent.map(item => (
              <div
                key={item.sale.id}
                className="p-4 bg-white rounded-xl border border-rose-200 shadow-sm space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-[#1a3c6e]">
                        {item.sale.saleNumber || item.sale.id.slice(0, 8)}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800">
                        Inconsistent
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Customer:{' '}
                      <strong className="text-slate-800">
                        {item.customer?.name || 'Unknown'}
                      </strong>{' '}
                      ({item.customer?.customerId || 'No ID'}) &bull; Plot:{' '}
                      <strong>
                        {item.plot?.plotNumber} Block {item.plot?.block}
                      </strong>{' '}
                      &bull; Date: {formatDate(item.sale.saleDate)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/reports/pending/customer/${item.sale.customerId}`)}
                      className="btn btn-secondary btn-sm text-xs flex items-center gap-1"
                    >
                      <BookOpen size={13} /> View Ledger
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/sales/list?saleId=${item.sale.id}`)}
                      className="btn btn-primary btn-sm text-xs flex items-center gap-1"
                    >
                      <Eye size={13} /> View in Sales List
                    </button>
                  </div>
                </div>

                {/* Specific Issue Badges */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                    Detected Discrepancies:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {item.issues.map((issue, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200"
                      >
                        &bull; {issue}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Expected vs Actual Metric Comparison Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                      Document Count
                    </span>
                    <span className="font-bold text-slate-800">
                      Expected {item.expectedCount} &bull; Actual{' '}
                      <span className={item.actualCount !== item.expectedCount ? 'text-rose-600 font-bold' : ''}>
                        {item.actualCount}
                      </span>
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                      Scheduled Total
                    </span>
                    <span className="font-bold text-slate-800">
                      Expected {formatCurrency(item.expectedTotal)}
                    </span>
                    <span className={`block text-[11px] ${item.actualTotal !== item.expectedTotal ? 'text-rose-600 font-bold' : 'text-slate-600'}`}>
                      Actual {formatCurrency(item.actualTotal)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                      Remaining Amount
                    </span>
                    <span className="font-bold text-slate-800">
                      Sale Record {formatCurrency(item.saleRemaining)}
                    </span>
                    <span className={`block text-[11px] ${item.unpaidDocsTotal !== item.saleRemaining ? 'text-rose-600 font-bold' : 'text-slate-600'}`}>
                      Unpaid Docs {formatCurrency(item.unpaidDocsTotal)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                      Down Payment Sum
                    </span>
                    <span className="font-bold text-slate-800">
                      Expected {formatCurrency(item.expectedDp)}
                    </span>
                    <span className={`block text-[11px] ${item.actualDpSum !== item.expectedDp ? 'text-rose-600 font-bold' : 'text-slate-600'}`}>
                      Rec+Rem {formatCurrency(item.actualDpSum)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DataHealth;
