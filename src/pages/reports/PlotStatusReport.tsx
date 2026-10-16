import React, { useEffect, useState } from 'react';
import { Home } from 'lucide-react';
import toast from 'react-hot-toast';
import StatusBadge from '../../components/ui/StatusBadge';
import ReportLayout, { exportRowsToCsv, type ReportKpi } from '../../components/reports/ReportLayout';
import ReportFilters, { type DateRange } from '../../components/ui/ReportFilters';
import { getCollection, getDocument } from '../../firebase/firestore';
import { printContent, generateReportHTML } from '../../utils/printUtils';
import type { Plot, CompanySettings } from '../../types';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';

const PIE_COLORS = ['#22c55e', '#e8a020', '#2557a7', '#ef4444', '#8b5cf6'];

const PlotStatusReport: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [search, setSearch] = useState('');
  const [filterBlock, setFilterBlock] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [plots, setPlots] = useState<Plot[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getCollection<Plot>('plots'),
      getDocument<CompanySettings>('settings', 'company'),
    ]).then(([p, comp]) => {
      setPlots(p);
      if (comp) setCompany(comp);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, []);

  const byStatus = (status: string) => plots.filter(p => p.status === status);

  const blocks = Array.from(new Set(plots.map(p => p.block))).filter(Boolean).sort();

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

  const filteredPlots = plots.filter(p => {
    if (filterBlock && p.block !== filterBlock) return false;
    if (filterStatus && p.status !== filterStatus) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!p.plotNumber.toLowerCase().includes(q) && !p.block.toLowerCase().includes(q) && !p.category.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  }).sort((a, b) => a.block.localeCompare(b.block) || a.plotNumber.localeCompare(b.plotNumber, undefined, { numeric: true }));

  const kpis: ReportKpi[] = [
    { label: 'Total Plots', value: plots.length, color: 'navy', hint: `${blocks.length} blocks mapped` },
    { label: 'Available', value: byStatus('available').length, color: 'green', hint: 'Ready for booking' },
    { label: 'Booked', value: byStatus('booked').length, color: 'amber', hint: 'Pending full sale' },
    { label: 'Sold', value: byStatus('sold').length, color: 'blue', hint: 'Under active agreement' },
  ];

  const handlePrint = () => {
    if (!company) { toast.error('Configure company settings'); return; }
    const rows = filteredPlots.map(p => [p.plotNumber, p.block, `${p.size} ${p.sizeUnit}`, p.category, p.status]);
    const html = generateReportHTML(
      company,
      'Plot Status Report',
      ['Plot #', 'Block', 'Size', 'Category', 'Status'],
      rows,
      `Total: ${filteredPlots.length} | Available: ${filteredPlots.filter(p => p.status === 'available').length} | Booked: ${filteredPlots.filter(p => p.status === 'booked').length} | Sold: ${filteredPlots.filter(p => p.status === 'sold').length}`,
    );
    printContent(html, 'Plot Status Report');
  };

  const handleExportCSV = () => {
    const headers = ['Plot #', 'Block', 'Size', 'Size Unit', 'Category', 'Status'];
    const rows = filteredPlots.map(p => [
      p.plotNumber,
      p.block,
      p.size,
      p.sizeUnit,
      p.category,
      p.status,
    ]);
    exportRowsToCsv('plot-status-report', headers, rows);
  };

  return (
    <ReportLayout
      reportName="Plot Status"
      title="Plot Status Report"
      subtitle="Complete inventory breakdown by block, development status, and availability"
      icon={<Home size={18} />}
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
          searchPlaceholder="Search plot #, block, category..."
          extraFilters={
            <div className="flex items-center gap-2 flex-wrap">
              <select
                className="input-field text-xs py-2 w-36"
                value={filterBlock}
                onChange={e => setFilterBlock(e.target.value)}
              >
                <option value="">All Blocks</option>
                {blocks.map(b => (
                  <option key={b} value={b}>Block {b}</option>
                ))}
              </select>
              <select
                className="input-field text-xs py-2 w-36"
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="available">Available</option>
                <option value="booked">Booked</option>
                <option value="sold">Sold</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          }
        />
      }
      topContent={
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 no-print">
          {/* Status Distribution Pie Chart */}
          <div className="card">
            <h3 className="font-semibold text-slate-800 text-sm mb-3">Status Distribution</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Block Breakdown */}
          {Object.keys(byBlock).length > 0 && (
            <div className="card overflow-x-auto">
              <h3 className="font-semibold text-slate-800 text-sm mb-3">Per Block Breakdown</h3>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">Block</th>
                    <th className="py-2 px-3">Total</th>
                    <th className="py-2 px-3">Available</th>
                    <th className="py-2 px-3">Booked</th>
                    <th className="py-2 px-3">Sold</th>
                    <th className="py-2 px-3">Cancelled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.entries(byBlock).sort(([a], [b]) => a.localeCompare(b)).map(([block, counts]) => (
                    <tr key={block} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2 px-3 font-semibold text-primary">Block {block}</td>
                      <td className="py-2 px-3 font-bold text-slate-800">{counts.total}</td>
                      <td className="py-2 px-3 text-emerald-600 font-medium">{counts.available || 0}</td>
                      <td className="py-2 px-3 text-amber-600 font-medium">{counts.booked || 0}</td>
                      <td className="py-2 px-3 text-blue-600 font-medium">{counts.sold || 0}</td>
                      <td className="py-2 px-3 text-rose-500 font-medium">{counts.cancelled || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      }
      footerContent={
        <div className="flex justify-between items-center font-bold">
          <span>Total: {filteredPlots.length} plots</span>
          <span className="text-primary">
            {filteredPlots.filter(p => p.status === 'available').length} Available / {filteredPlots.filter(p => p.status === 'sold').length} Sold
          </span>
        </div>
      }
    >
      <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wider">Plot Inventory</h3>
        <span className="text-xs text-slate-500">{filteredPlots.length} plots listed</span>
      </div>
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50/90 sticky top-0 z-10 text-slate-600 font-semibold border-b border-slate-200 backdrop-blur-sm">
          <tr>
            <th className="py-3 px-3.5">Plot #</th>
            <th className="py-3 px-3.5">Block</th>
            <th className="py-3 px-3.5">Size</th>
            <th className="py-3 px-3.5">Category</th>
            <th className="py-3 px-3.5">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filteredPlots.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-12 text-center text-slate-400">
                No plots match the filters.
              </td>
            </tr>
          ) : (
            filteredPlots.map(p => (
              <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                <td className="py-3 px-3.5 font-mono font-bold text-slate-900">{p.plotNumber}</td>
                <td className="py-3 px-3.5 font-medium text-slate-700">Block {p.block}</td>
                <td className="py-3 px-3.5 text-slate-600">{p.size} {p.sizeUnit}</td>
                <td className="py-3 px-3.5 text-slate-600 capitalize">{p.category}</td>
                <td className="py-3 px-3.5"><StatusBadge status={p.status} size="sm" /></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </ReportLayout>
  );
};

export default PlotStatusReport;

