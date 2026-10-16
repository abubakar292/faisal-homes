const fs = require('fs');

const content = `import React, { useEffect, useState, useMemo } from 'react';
import { FileText, Printer, Download, Search, Eye, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import { getCollection, getDocument } from '../../firebase/firestore';
import { where, orderBy } from 'firebase/firestore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { printContent, generatePlotAgreement, generateInstallmentSchedule } from '../../utils/printUtils';
import type { Sale, Customer, Plot, Installment, CompanySettings } from '../../types';

export default function PlotAgreement() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);
  
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      getCollection<Sale>('sales'),
      getCollection<Customer>('customers'),
      getCollection<Plot>('plots'),
      getDocument<CompanySettings>('settings', 'company'),
    ]).then(([s, c, p, comp]) => {
      setSales(s.filter(sale => sale.status !== 'cancelled'));
      setCustomers(c);
      setPlots(p);
      if (comp) setCompany(comp);
    });
  }, []);

  const tableData = useMemo(() => {
    return sales.map(sale => {
      const customer = customers.find(c => c.id === sale.customerId);
      const plot = plots.find(p => p.id === sale.plotId);
      return { sale, customer, plot };
    }).filter(row => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        row.customer?.name.toLowerCase().includes(term) ||
        row.customer?.cnic.includes(term) ||
        row.plot?.plotNumber.toLowerCase().includes(term) ||
        row.sale.saleNumber?.toLowerCase().includes(term)
      );
    });
  }, [sales, customers, plots, searchTerm]);

  const handlePrintAgreement = (sale: Sale, customer: Customer, plot: Plot) => {
    if (!company) return toast.error('Company settings missing');
    const html = generatePlotAgreement(sale, customer, plot, company);
    printContent(html, \`Agreement-\${sale.saleNumber || sale.id}\`);
  };

  const handlePrintSchedule = async (sale: Sale, customer: Customer, plot: Plot) => {
    if (!company) return toast.error('Company settings missing');
    
    try {
      setLoadingActionId(sale.id);
      // Fetch only installments for this specific sale
      let insts = await getCollection<Installment>('installments', [
        where('saleId', '==', sale.id)
      ]);
      // Sort manually since we might not have a composite index on saleId + installmentNumber
      insts = insts.sort((a, b) => a.installmentNumber - b.installmentNumber);
      
      const html = generateInstallmentSchedule(sale, customer, plot, insts, company);
      printContent(html, \`Schedule-\${sale.saleNumber || sale.id}\`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load installment schedule');
    } finally {
      setLoadingActionId(null);
    }
  };

  return (
    <div>
      <PageHeader title="Plot Agreements & Schedules" subtitle="Search and print agreements and installment schedules" icon={<FileText size={20} />} />

      <div className="card">
        {/* Search Bar */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mb-6">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search by customer, CNIC, or plot..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 input-field"
            />
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                <th className="table-th">Customer Name</th>
                <th className="table-th">Plot Details</th>
                <th className="table-th">Sale Date</th>
                <th className="table-th">Price</th>
                <th className="table-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tableData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No sales found.
                  </td>
                </tr>
              ) : (
                tableData.map(({ sale, customer, plot }) => (
                  <tr key={sale.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className="table-td">
                      <div className="font-semibold text-slate-800">{customer?.name || 'Unknown'}</div>
                      <div className="text-xs text-slate-500">{customer?.cnic || ''}</div>
                    </td>
                    <td className="table-td">
                      {plot ? (
                        <>
                          <div className="font-medium text-slate-800">{plot.plotNumber}</div>
                          <div className="text-xs text-slate-500">Block {plot.block} • {plot.size} {plot.sizeUnit}</div>
                        </>
                      ) : (
                        <span className="text-slate-400">Unknown Plot</span>
                      )}
                    </td>
                    <td className="table-td text-slate-600">
                      {formatDate(sale.saleDate)}
                    </td>
                    <td className="table-td">
                      <div className="font-medium text-slate-800">{formatCurrency(sale.finalPrice)}</div>
                      <div className="text-xs text-slate-500">Rs. {formatCurrency(sale.remainingAmount)} remaining</div>
                    </td>
                    <td className="table-td text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => navigate(\`/sales/\${sale.id}\`)}
                          className="btn-icon bg-slate-100 text-slate-600 hover:bg-slate-200"
                          title="View Sale"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => customer && plot && handlePrintAgreement(sale, customer, plot)}
                          disabled={!customer || !plot}
                          className="btn-icon bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50"
                          title="Print Agreement"
                        >
                          <FileText size={16} />
                        </button>
                        <button
                          onClick={() => customer && plot && handlePrintSchedule(sale, customer, plot)}
                          disabled={(!customer || !plot) || loadingActionId === sale.id}
                          className="btn-icon bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50"
                          title="Print Schedule"
                        >
                          {loadingActionId === sale.id ? (
                            <span className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin block"></span>
                          ) : (
                            <Calendar size={16} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
`;

fs.writeFileSync('src/pages/sales/PlotAgreement.tsx', content, 'utf8');
console.log("PlotAgreement rewritten.");
