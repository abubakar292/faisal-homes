import React, { useEffect, useState, useRef } from 'react';
import { Map, User, FileText } from 'lucide-react';
import { BrandLoader } from '../../components/brand';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import { getCollection, getDocument } from '../../firebase/firestore';
import { where } from 'firebase/firestore';
import { formatCurrency } from '../../utils/formatters';
import type { Plot, Sale, Booking, Customer } from '../../types';
import gsap from 'gsap';

interface PlotDetails {
  loading: boolean;
  sale?: Sale | null;
  booking?: Booking | null;
  customer?: Customer | null;
}

const statusColors: Record<string, string> = {
  available: 'bg-green-100 border-green-300 text-green-700 hover:bg-green-200',
  booked:    'bg-amber-100 border-amber-300 text-amber-700 hover:bg-amber-200',
  sold:      'bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-200',
  cancelled: 'bg-red-100 border-red-300 text-red-700 hover:bg-red-200',
  reserved:  'bg-purple-100 border-purple-300 text-purple-700 hover:bg-purple-200',
};

const PlotMap: React.FC = () => {
  const [plots, setPlots] = useState<Plot[]>([]);
  const [filterBlock, setFilterBlock] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selected, setSelected] = useState<Plot | null>(null);
  const [loading, setLoading] = useState(true);

  const [detailsCache, setDetailsCache] = useState<Record<string, PlotDetails>>({});
  const detailsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getCollection<Plot>('plots').then(data => { setPlots(data); setLoading(false); });
  }, []);

  const fetchData = async (pid: string) => {
    try {
      const [sales, bookings] = await Promise.all([
        getCollection<Sale>('sales', [where('plotId', '==', pid)]),
        getCollection<Booking>('bookings', [where('plotId', '==', pid)])
      ]);
      const sale = sales.length > 0 ? sales[0] : null;
      const booking = bookings.length > 0 ? bookings[0] : null;
      let customer = null;
      const customerId = sale?.customerId || booking?.customerId;
      if (customerId) customer = await getDocument<Customer>('customers', customerId);
      
      setDetailsCache(prev => ({ ...prev, [pid]: { loading: false, sale, booking, customer } }));
    } catch (err) {
      console.error(err);
      setDetailsCache(prev => ({ ...prev, [pid]: { loading: false } }));
    }
  };

  useEffect(() => {
    if (!selected) return;
    const pid = selected.id;
    setDetailsCache(prev => {
      if (prev[pid]) return prev;
      fetchData(pid);
      return { ...prev, [pid]: { loading: true } };
    });
  }, [selected]);

  useEffect(() => {
    if (selected && detailsCache[selected.id] && !detailsCache[selected.id].loading && detailsRef.current) {
      gsap.fromTo(detailsRef.current.children, 
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.4, stagger: 0.1, ease: 'power2.out' }
      );
    }
  }, [selected, detailsCache]);

  const blocks = [...new Set(plots.map(p => p.block))].sort();

  const filtered = plots.filter(p =>
    (!filterBlock || p.block === filterBlock) &&
    (!filterStatus || p.status === filterStatus)
  );

  // Group by block
  const grouped = filtered.reduce((acc, plot) => {
    if (!acc[plot.block]) acc[plot.block] = [];
    acc[plot.block].push(plot);
    return acc;
  }, {} as Record<string, Plot[]>);

  const legend = [
    { status: 'available', label: 'Available', color: 'bg-green-200' },
    { status: 'booked',    label: 'Booked',    color: 'bg-amber-200' },
    { status: 'sold',      label: 'Sold',      color: 'bg-blue-200' },
    { status: 'cancelled', label: 'Cancelled', color: 'bg-red-200' },
  ];

  return (
    <div>
      <PageHeader title="Plot Map" subtitle="Visual overview of all plots" icon={<Map size={20} />} />

      {/* Legend + Filters */}
      <div className="card mb-5 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          {legend.map(l => (
            <div key={l.status} className="flex items-center gap-1.5">
              <div className={`w-4 h-4 rounded ${l.color} border border-slate-300`} />
              <span className="text-xs text-slate-600">{l.label}</span>
            </div>
          ))}
        </div>
        <div className="flex-1" />
        <select className="input-field w-36" value={filterBlock} onChange={e => setFilterBlock(e.target.value)}>
          <option value="">All Blocks</option>
          {blocks.map(b => <option key={b}>{b}</option>)}
        </select>
        <select className="input-field w-36" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Status</option>
          {['available','booked','sold','cancelled'].map(s =>
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          )}
        </select>
      </div>

      {loading ? (
        <div className="card text-center py-16 text-slate-400">Loading map...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="card text-center py-16 text-slate-400">No plots to display</div>
      ) : (
        Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([block, blockPlots]) => (
          <div key={block} className="card mb-4">
            <h3 className="font-semibold text-slate-700 mb-3">Block {block}</h3>
            <div className="flex flex-wrap gap-2">
              {blockPlots.sort((a, b) => a.plotNumber.localeCompare(b.plotNumber, undefined, { numeric: true })).map(plot => (
                <button
                  key={plot.id}
                  onClick={() => setSelected(plot)}
                  className={`border rounded-lg px-3 py-2 text-xs font-semibold transition-all cursor-pointer min-w-[70px] ${statusColors[plot.status] || 'bg-slate-100 border-slate-300 text-slate-600'}`}
                >
                  <div>{plot.plotNumber}</div>
                  <div className="font-normal opacity-75">{plot.size}{plot.sizeUnit[0]}</div>
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Plot detail popup */}
      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={`Plot ${selected?.plotNumber}`} size="md">
        {selected && (
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
              <span className="text-sm font-medium text-slate-700">Current Status</span>
              <StatusBadge status={selected.status} />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                ['Block/Phase', selected.block],
                ['Size', `${selected.size} ${selected.sizeUnit}`],
                ['Category', selected.category],
                ['Location', selected.location || '—'],
              ].map(([k, v]) => (
                <div key={k} className="p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 mb-1">{k}</div>
                  <div className="text-sm font-semibold text-slate-800">{v}</div>
                </div>
              ))}
            </div>

            {selected.description && (
              <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
                <div className="text-xs text-slate-500 mb-1">Description</div>
                <div className="text-sm text-slate-700">{selected.description}</div>
              </div>
            )}
            
            {/* Lazy Loaded Data */}
            {detailsCache[selected.id]?.loading ? (
              <BrandLoader size={56} />
            ) : (
              <div ref={detailsRef} className="space-y-4 pt-2">
                {detailsCache[selected.id]?.customer && (
                  <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm opacity-0">
                    <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <User size={16} className="text-blue-600" />
                      Sold To
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-slate-500">Name</div>
                        <div className="text-sm font-medium">{detailsCache[selected.id].customer?.name}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Father Name</div>
                        <div className="text-sm font-medium">{detailsCache[selected.id].customer?.fatherName || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Phone</div>
                        <div className="text-sm font-medium">{detailsCache[selected.id].customer?.phone}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">CNIC</div>
                        <div className="text-sm font-medium">{detailsCache[selected.id].customer?.cnic}</div>
                      </div>
                    </div>
                  </div>
                )}
                
                {(detailsCache[selected.id]?.sale || detailsCache[selected.id]?.booking) && (
                  <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm opacity-0">
                    <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <FileText size={16} className="text-green-600" />
                      Sale Details
                    </h4>
                    {detailsCache[selected.id].sale ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs text-slate-500">Sale Number</div>
                          <div className="text-sm font-medium">{detailsCache[selected.id].sale?.saleNumber}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Final Price</div>
                          <div className="text-sm font-medium text-green-700">{formatCurrency(detailsCache[selected.id].sale?.finalPrice || 0)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Down Payment</div>
                          <div className="text-sm font-medium">{formatCurrency(detailsCache[selected.id].sale?.downPayment || 0)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Remaining Balance</div>
                          <div className="text-sm font-medium">{formatCurrency(detailsCache[selected.id].sale?.remainingAmount || 0)}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                         <div>
                          <div className="text-xs text-slate-500">Booking Receipt</div>
                          <div className="text-sm font-medium">{detailsCache[selected.id].booking?.receiptNumber}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Total Price</div>
                          <div className="text-sm font-medium text-green-700">{formatCurrency(detailsCache[selected.id].booking?.totalPrice || 0)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PlotMap;
