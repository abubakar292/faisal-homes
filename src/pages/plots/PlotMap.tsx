import React, { useEffect, useState, useRef } from 'react';
import { Map as MapIcon, User, FileText, Box, Compass, Flag } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { BrandLoader } from '../../components/brand';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import { getCollection, getDocument } from '../../firebase/firestore';
import { where } from 'firebase/firestore';
import { formatCurrency } from '../../utils/formatters';
import type { Plot, Sale, Booking, Customer } from '../../types';
import gsap from 'gsap';
import { usePlotRects } from '../../features/plotMap3d/usePlotRects';
import { useSoldCelebrations } from '../../features/plotMap3d/useSoldCelebrations';

const HouseOverlay = React.lazy(() => import('../../features/plotMap3d/HouseOverlay'));

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

  // 3D houses toggle (persisted in localStorage, default on)
  const [enable3d, setEnable3d] = useState<boolean>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('faisal_plot_map_3d') : null;
    if (saved !== null) return saved === 'true';
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      return true;
    }
    return true;
  });

  const [isTilt, setIsTilt] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const plotElementsRef = useRef<Map<string, HTMLElement>>(new Map());

  const [searchParams] = useSearchParams();

  const toggle3d = () => {
    setEnable3d((prev) => {
      const next = !prev;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('faisal_plot_map_3d', String(next));
      }
      return next;
    });
  };

  const [detailsCache, setDetailsCache] = useState<Record<string, PlotDetails>>({});
  const detailsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchParams.get('demo3d') === '1') {
      const demoPlots: Plot[] = [
        { id: 'demo-1', plotNumber: 'A-101', block: 'A', size: 3, sizeUnit: 'Marla', category: 'General', status: 'sold', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
        { id: 'demo-2', plotNumber: 'A-102', block: 'A', size: 5, sizeUnit: 'Marla', category: 'General', status: 'sold', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
        { id: 'demo-3', plotNumber: 'A-103', block: 'A', size: 7, sizeUnit: 'Marla', category: 'General', status: 'sold', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
        { id: 'demo-4', plotNumber: 'A-104', block: 'A', size: 10, sizeUnit: 'Marla', category: 'Corner', status: 'sold', location: 'Phase 1', description: 'Corner plot', createdAt: new Date() },
        { id: 'demo-5', plotNumber: 'A-105', block: 'A', size: 1, sizeUnit: 'Kanal', category: 'Boulevard', status: 'sold', location: 'Phase 1', description: 'Boulevard plot', createdAt: new Date() },
        { id: 'demo-6', plotNumber: 'B-201', block: 'B', size: 5, sizeUnit: 'Marla', category: 'General', status: 'available', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
        { id: 'demo-7', plotNumber: 'B-202', block: 'B', size: 5, sizeUnit: 'Marla', category: 'General', status: 'booked', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
      ];
      setPlots(demoPlots);
      setLoading(false);
      return;
    }

    getCollection<Plot>('plots').then(data => { setPlots(data); setLoading(false); });
  }, [searchParams]);

  // Hook for 3D plot screen rectangles
  const rectItems = usePlotRects({
    plots,
    containerRef,
    plotElementsRef,
    filterBlock,
    filterStatus,
    enabled: enable3d && !loading,
  });

  // Hook for celebration build animations & deep links
  const { celebratingPlotIds, handleCelebrationEnd } = useSoldCelebrations({
    plotElementsRef,
    enabled: enable3d && !loading,
  });

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
      <PageHeader title="Plot Map" subtitle="Visual overview of all plots" icon={<MapIcon size={20} />} />

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
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* 3D Houses Toggle */}
          <button
            type="button"
            onClick={toggle3d}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border cursor-pointer ${
              enable3d
                ? 'bg-[#1a3c6e] text-white border-[#1a3c6e] shadow-sm'
                : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
            }`}
            title="Toggle 3D houses on sold plots"
          >
            <Box size={14} className={enable3d ? 'text-[#e7b861]' : 'text-slate-400'} />
            <span>3D Houses</span>
          </button>

          {/* Tilt View Toggle (Desktop & Tablet) */}
          <button
            type="button"
            onClick={() => setIsTilt((prev) => !prev)}
            className={`hidden md:flex px-3 py-1.5 rounded-lg text-xs font-semibold items-center gap-1.5 transition-all border cursor-pointer ${
              isTilt
                ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
            }`}
            title="Toggle oblique map tilt"
          >
            <Compass size={14} className={isTilt ? 'text-amber-200' : 'text-slate-400'} />
            <span>Tilt View</span>
          </button>

          <select className="input-field w-full sm:w-36" value={filterBlock} onChange={e => setFilterBlock(e.target.value)}>
            <option value="">All Blocks</option>
            {blocks.map(b => <option key={b}>{b}</option>)}
          </select>
          <select className="input-field w-full sm:w-36" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            {['available','booked','sold','cancelled'].map(s =>
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            )}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card text-center py-16 flex justify-center items-center">
          <BrandLoader size={56} />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="card text-center py-16 text-slate-400">No plots to display</div>
      ) : (
        <div
          ref={containerRef}
          className="relative min-h-[400px] transition-transform duration-500"
          style={
            isTilt
              ? {
                  perspective: '1200px',
                  transform: 'rotateX(28deg) scale(0.96)',
                  transformOrigin: '50% 10%',
                }
              : undefined
          }
        >
          {enable3d && rectItems.length > 0 && (
            <React.Suspense fallback={null}>
              <HouseOverlay
                items={rectItems}
                celebrate={celebratingPlotIds}
                onCelebrationEnd={handleCelebrationEnd}
                plotElementsRef={plotElementsRef}
                containerRef={containerRef}
              />
            </React.Suspense>
          )}

          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([block, blockPlots]) => (
            <div key={block} className="card mb-4 relative">
              <h3 className="font-semibold text-slate-700 mb-3">Block {block}</h3>
              <div className="flex flex-wrap gap-2">
                {blockPlots.sort((a, b) => a.plotNumber.localeCompare(b.plotNumber, undefined, { numeric: true })).map(plot => (
                  <button
                    key={plot.id}
                    ref={(el) => {
                      if (el) plotElementsRef.current.set(plot.id, el);
                      else plotElementsRef.current.delete(plot.id);
                    }}
                    onClick={() => setSelected(plot)}
                    className={`border rounded-lg px-3 py-2 text-xs font-semibold transition-all cursor-pointer min-w-[70px] min-h-[44px] flex flex-col justify-center items-center ${statusColors[plot.status] || 'bg-slate-100 border-slate-300 text-slate-600'}`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>{plot.plotNumber}</span>
                      {plot.status === 'booked' && (
                        <Flag size={11} className="text-amber-700" />
                      )}
                    </div>
                    <div className="font-normal opacity-75">{plot.size}{plot.sizeUnit[0]}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
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
