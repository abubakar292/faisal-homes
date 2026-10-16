import React, { useEffect, useState } from 'react';
import ReportFilters, { DateRange } from '../../components/ui/ReportFilters';
import { Home, Download, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';
import { getCollection, getDocument } from '../../firebase/firestore';
import { formatCurrency } from '../../utils/formatters';
import { printContent, generateReportHTML } from '../../utils/printUtils';
import type { Plot, CompanySettings } from '../../types';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';

const PIE_COLORS = ['#22c55e', '#e8a020', '#2557a7', '#ef4444', '#8b5cf6'];

const PlotStatusReport: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [search, setSearch] = useState('');
  const [plots, setPlots] = useState<Plot[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);

  useEffect(() => {
    getCollection<Plot>('plots').then(setPlots);
    getDocument<CompanySettings>('settings', 'company').then(c => { if (c) setCompany(c); });
  }, []);

  const byStatus = (status: string) => plots.filter(p => p.status === status);
  const byBlock = plots.reduce((acc, p) => {
    if (!acc[p.block]) acc[p.block] = { available: 0, booked: 0, sold: 0, cancelled: 0, total: 0 };
    acc[p.block][p.status as keyof typeof acc[string]] = (acc[p.block][p.status as keyof typeof acc[string]] || 0) + 1;
    acc[p.block].total++;
    return acc;
  }, {} as Record<string, Record<string, number>>);

  const pieData = [
    { name: 'Available', value: byStatus('available').length },
    { name: 'Booked', value: byStatus('booked').length },
    { name: 'Sold', value: byStatus('sold').length },
    { name: 'Cancelled', value: byStatus('cancelled').length },
  ].filter(d => d.value > 0);

  const totalValue = 0; // Price now set at booking time, not on plot
  const soldValue  = 0;

  const handlePrint = () => {
    if (!company) { toast.error('Configure company settings'); return; }
    const rows = plots.map(p => [p.plotNumber, p.block, `${p.size} ${p.sizeUnit}`, p.category, p.status]);
    const html = generateReportHTML(company, 'Plot Status Report', ['Plot #', 'Block', 'Size', 'Category', 'Status'], rows, `Total: ${plots.length} | Sold: ${byStatus('sold').length} | Available: ${byStatus('available').length}`);
    printContent(html, 'Report');
  };

  return (
    <div>
      <PageHeader
        title="Plot Status Report"
        subtitle={`${plots.length} total plots`}
        icon={<Home size={20} />}
      />
      <ReportFilters 
        search={search}
        onSearchChange={setSearch}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        actions={<>
            <button onClick={handlePrint} className="btn-primary"><Printer size={15} /> Print</button>
            
          </>}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
        {[
          { label: 'Total', value: plots.length, color: 'text-primary' },
          { label: 'Available', value: byStatus('available').length, color: 'text-green-600' },
          { label: 'Booked', value: byStatus('booked').length, color: 'text-amber-600' },
          { label: 'Sold', value: byStatus('sold').length, color: 'text-blue-600' },
          { label: 'Cancelled', value: byStatus('cancelled').length, color: 'text-red-500' },
        ].map(item => (
          <div key={item.label} className="card text-center">
            <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
            <p className="text-xs text-slate-500 mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Pie chart */}
        <div className="card">
          <h3 className="font-semibold text-slate-700 mb-3">Status Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label>
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Value summary */}
        <div className="card">
          <h3 className="font-semibold text-slate-700 mb-3">Plot Count Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between"><span className="text-slate-500">Total Plots</span><span className="font-semibold text-primary">{plots.length}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Sold</span><span className="font-semibold text-blue-600">{byStatus('sold').length}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Available</span><span className="font-semibold text-green-600">{byStatus('available').length}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Booked</span><span className="font-semibold text-amber-600">{byStatus('booked').length}</span></div>
            <p className="text-xs text-slate-400 pt-1">Pricing is set at booking time via per-marla rate.</p>
          </div>
        </div>
      </div>

      {/* Per block breakdown */}
      {Object.keys(byBlock).length > 0 && (
        <div className="card mb-5">
          <h3 className="font-semibold text-slate-700 mb-3">Per Block Breakdown</h3>
          <table className="w-full">
            <thead className="bg-slate-50"><tr>{['Block', 'Total', 'Available', 'Booked', 'Sold', 'Cancelled'].map(h => <th key={h} className="table-th">{h}</th>)}</tr></thead>
            <tbody>
              {Object.entries(byBlock).sort(([a], [b]) => a.localeCompare(b)).map(([block, counts]) => (
                <tr key={block} className="table-row">
                  <td className="table-td font-semibold text-primary">{block}</td>
                  <td className="table-td font-bold">{counts.total}</td>
                  <td className="table-td text-green-600">{counts.available || 0}</td>
                  <td className="table-td text-amber-600">{counts.booked || 0}</td>
                  <td className="table-td text-blue-600">{counts.sold || 0}</td>
                  <td className="table-td text-red-500">{counts.cancelled || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail list */}
      <div className="card overflow-x-auto">
        <h3 className="font-semibold text-slate-700 mb-3">All Plots</h3>
        <table className="w-full">
          <thead className="bg-slate-50"><tr>{['Plot #', 'Block', 'Size', 'Category', 'Status'].map(h => <th key={h} className="table-th">{h}</th>)}</tr></thead>
          <tbody>
            {plots.sort((a, b) => a.block.localeCompare(b.block) || a.plotNumber.localeCompare(b.plotNumber, undefined, { numeric: true })).map(p => (
              <tr key={p.id} className="table-row">
                <td className="table-td font-mono font-semibold">{p.plotNumber}</td>
                <td className="table-td">{p.block}</td>
                <td className="table-td">{p.size} {p.sizeUnit}</td>
                <td className="table-td">{p.category}</td>
                <td className="table-td"><StatusBadge status={p.status} size="sm" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PlotStatusReport;
