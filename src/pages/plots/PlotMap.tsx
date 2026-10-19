import React, { useEffect, useState, useRef } from 'react';
import { Map as MapIcon, Flag, Home, Compass } from 'lucide-react';
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
import {
  HouseSprite,
  sizeToVariant,
  paletteFor,
  useSoldCelebrations,
} from '../../features/plotHouses';

interface PlotDetails {
  loading: boolean;
  sale?: Sale | null;
  booking?: Booking | null;
  customer?: Customer | null;
}

const DEMO_FIXTURE_PLOTS: Plot[] = [
  { id: 'demo-A-201', plotNumber: 'A-201', block: 'A', size: 10, sizeUnit: 'Marla', category: 'General', status: 'sold', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
  { id: 'demo-A-202', plotNumber: 'A-202', block: 'A', size: 20, sizeUnit: 'Marla', category: 'General', status: 'sold', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
  { id: 'demo-A-203', plotNumber: 'A-203', block: 'A', size: 10, sizeUnit: 'Marla', category: 'General', status: 'sold', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
  { id: 'demo-A-204', plotNumber: 'A-204', block: 'A', size: 5, sizeUnit: 'Marla', category: 'General', status: 'sold', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
  { id: 'demo-A-205', plotNumber: 'A-205', block: 'A', size: 10, sizeUnit: 'Marla', category: 'General', status: 'available', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
  { id: 'demo-A-206', plotNumber: 'A-206', block: 'A', size: 10, sizeUnit: 'Marla', category: 'General', status: 'sold', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
  { id: 'demo-A-207', plotNumber: 'A-207', block: 'A', size: 5, sizeUnit: 'Marla', category: 'General', status: 'sold', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
  { id: 'demo-A-208', plotNumber: 'A-208', block: 'A', size: 5, sizeUnit: 'Marla', category: 'General', status: 'sold', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
  { id: 'demo-A-209', plotNumber: 'A-209', block: 'A', size: 20, sizeUnit: 'Marla', category: 'General', status: 'available', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
  { id: 'demo-A-210', plotNumber: 'A-210', block: 'A', size: 12, sizeUnit: 'Marla', category: 'General', status: 'sold', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
  { id: 'demo-A-211', plotNumber: 'A-211', block: 'A', size: 10, sizeUnit: 'Marla', category: 'General', status: 'available', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
  { id: 'demo-A-212', plotNumber: 'A-212', block: 'A', size: 12, sizeUnit: 'Marla', category: 'General', status: 'booked', location: 'Phase 1', description: 'Booked plot', createdAt: new Date() },
  { id: 'demo-A-213', plotNumber: 'A-213', block: 'A', size: 12, sizeUnit: 'Marla', category: 'General', status: 'sold', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
  { id: 'demo-A-214', plotNumber: 'A-214', block: 'A', size: 5, sizeUnit: 'Marla', category: 'General', status: 'available', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
  { id: 'demo-A-215', plotNumber: 'A-215', block: 'A', size: 5, sizeUnit: 'Marla', category: 'General', status: 'sold', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
  { id: 'demo-A-216', plotNumber: 'A-216', block: 'A', size: 5, sizeUnit: 'Marla', category: 'General', status: 'available', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
  { id: 'demo-A-217', plotNumber: 'A-217', block: 'A', size: 10, sizeUnit: 'Marla', category: 'General', status: 'sold', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
  { id: 'demo-A-218', plotNumber: 'A-218', block: 'A', size: 10, sizeUnit: 'Marla', category: 'General', status: 'available', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
  { id: 'demo-A-219', plotNumber: 'A-219', block: 'A', size: 10, sizeUnit: 'Marla', category: 'General', status: 'available', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
  { id: 'demo-A-220', plotNumber: 'A-220', block: 'A', size: 10, sizeUnit: 'Marla', category: 'General', status: 'sold', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
  { id: 'demo-A-221', plotNumber: 'A-221', block: 'A', size: 7, sizeUnit: 'Marla', category: 'General', status: 'available', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
  { id: 'demo-A-222', plotNumber: 'A-222', block: 'A', size: 12, sizeUnit: 'Marla', category: 'General', status: 'sold', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
  { id: 'demo-A-223', plotNumber: 'A-223', block: 'A', size: 12, sizeUnit: 'Marla', category: 'General', status: 'available', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
  { id: 'demo-A-224', plotNumber: 'A-224', block: 'A', size: 10, sizeUnit: 'Marla', category: 'General', status: 'available', location: 'Phase 1', description: 'Standard plot', createdAt: new Date() },
];

const PlotMap: React.FC = () => {
  const [plots, setPlots] = useState<Plot[]>([]);
  const [filterBlock, setFilterBlock] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selected, setSelected] = useState<Plot | null>(null);
  const [loading, setLoading] = useState(true);

  // Houses toggle (persisted in localStorage, default on)
  const [enableHouses, setEnableHouses] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('faisal_plot_map_houses');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true;
  });

  const [isTilt, setIsTilt] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const plotElementsRef = useRef<Map<string, HTMLElement>>(new Map());

  const [searchParams] = useSearchParams();

  const toggleHouses = () => {
    setEnableHouses((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('faisal_plot_map_houses', String(next));
      } catch {}
      return next;
    });
  };

  const [detailsCache, setDetailsCache] = useState<Record<string, PlotDetails>>({});
  const detailsRef = useRef<HTMLDivElement>(null);

  // Hook for celebration build animations & deep links
  const { celebratingPlotIds, handleCelebrationEnd, setCelebratingPlotIds } = useSoldCelebrations({
    plotElementsRef,
    enabled: enableHouses && !loading,
  });

  useEffect(() => {
    const isDemo = searchParams.get('demo') === '1' || searchParams.get('demo3d') === '1';
    if (isDemo) {
      const celebrateTarget = searchParams.get('celebrate');
      const cloned = DEMO_FIXTURE_PLOTS.map((p) => {
        if (celebrateTarget && (p.plotNumber === celebrateTarget || p.id === celebrateTarget)) {
          return { ...p, status: 'sold' as const };
        }
        return { ...p };
      });
      setPlots(cloned);
      setLoading(false);

      if (celebrateTarget) {
        const found = cloned.find(
          (p) => p.plotNumber === celebrateTarget || p.id === celebrateTarget
        );
        if (found) {
          setCelebratingPlotIds([found.id]);
        }
      }
      return;
    }

    getCollection<Plot>('plots').then((data) => {
      setPlots(data);
      setLoading(false);
    });
  }, [searchParams, setCelebratingPlotIds]);

  const fetchData = async (pid: string) => {
    try {
      const [sales, bookings] = await Promise.all([
        getCollection<Sale>('sales', [where('plotId', '==', pid)]),
        getCollection<Booking>('bookings', [where('plotId', '==', pid)]),
      ]);
      const sale = sales.length > 0 ? sales[0] : null;
      const booking = bookings.length > 0 ? bookings[0] : null;
      let customer = null;
      const customerId = sale?.customerId || booking?.customerId;
      if (customerId) customer = await getDocument<Customer>('customers', customerId);

      setDetailsCache((prev) => ({ ...prev, [pid]: { loading: false, sale, booking, customer } }));
    } catch (err) {
      console.error(err);
      setDetailsCache((prev) => ({ ...prev, [pid]: { loading: false } }));
    }
  };

  useEffect(() => {
    if (!selected) return;
    const pid = selected.id;
    setDetailsCache((prev) => {
      if (prev[pid]) return prev;
      fetchData(pid);
      return { ...prev, [pid]: { loading: true } };
    });
  }, [selected]);

  useEffect(() => {
    if (selected && detailsCache[selected.id] && !detailsCache[selected.id].loading && detailsRef.current) {
      gsap.fromTo(
        detailsRef.current.children,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.4, stagger: 0.1, ease: 'power2.out' }
      );
    }
  }, [selected, detailsCache]);

  const blocks = [...new Set(plots.map((p) => p.block))].sort();

  const filtered = plots.filter(
    (p) =>
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
    { status: 'available', label: 'Available', boxClass: 'bg-white border-slate-300' },
    { status: 'booked', label: 'Booked', boxClass: 'bg-[#fffbf0] border-amber-300' },
    { status: 'sold', label: 'Sold', boxClass: 'bg-[#edf7ed] border-[#86efac]' },
    { status: 'cancelled', label: 'Cancelled', boxClass: 'bg-red-50 border-red-200' },
  ];

  return (
    <div>
      <PageHeader
        title="Plot Map"
        subtitle="Visual overview of all plots with bungalow houses"
        icon={<MapIcon size={20} />}
      />

      {/* Legend + Filters */}
      <div className="card mb-5 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          {legend.map((l) => (
            <div key={l.status} className="flex items-center gap-1.5">
              <div className={`w-4 h-4 rounded ${l.boxClass} border`} />
              <span className="text-xs text-slate-600">{l.label}</span>
            </div>
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Houses Toggle */}
          <button
            type="button"
            onClick={toggleHouses}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border cursor-pointer ${
              enableHouses
                ? 'bg-[#1a3c6e] text-white border-[#1a3c6e] shadow-sm'
                : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
            }`}
            title="Toggle bungalow houses on sold plots"
          >
            <Home size={14} className={enableHouses ? 'text-[#e7b861]' : 'text-slate-400'} />
            <span>Houses</span>
          </button>

          {/* Tilt View Toggle */}
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

          <select
            className="input-field w-full sm:w-36"
            value={filterBlock}
            onChange={(e) => setFilterBlock(e.target.value)}
          >
            <option value="">All Blocks</option>
            {blocks.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          <select
            className="input-field w-full sm:w-36"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All Status</option>
            {['available', 'booked', 'sold', 'cancelled'].map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
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
          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([block, blockPlots]) => (
              <div
                key={block}
                className="card mb-4 relative"
                style={blockPlots.length > 400 ? { contentVisibility: 'auto' } : undefined}
              >
                <div className="flex items-baseline justify-between mb-3">
                  <h3 className="font-semibold text-slate-700 text-sm sm:text-base">
                    Block {block}
                  </h3>
                  <span className="text-[11px] text-slate-400 hidden sm:inline">
                    Sold plots show a bungalow. Tap a plot for details.
                  </span>
                </div>

                {/* Grid view: exactly 4 columns on phones (360px), responsive flex wrap on larger screens */}
                <div className="grid grid-cols-4 sm:flex sm:flex-wrap gap-2">
                  {blockPlots
                    .sort((a, b) =>
                      a.plotNumber.localeCompare(b.plotNumber, undefined, { numeric: true })
                    )
                    .map((plot) => {
                      const isSold = plot.status === 'sold';
                      const isBooked = plot.status === 'booked';
                      const isAvailable = plot.status === 'available';
                      const isCelebrating = celebratingPlotIds.includes(plot.id);

                      const variant = sizeToVariant(plot.size, plot.sizeUnit);
                      const palette = paletteFor(plot.id);

                      // Style tile based on status
                      let tileClass = 'bg-slate-50 border-slate-200 text-slate-600';
                      if (isSold) {
                        tileClass = 'bg-[#edf7ed] border-[#86efac] text-slate-800 shadow-2xs';
                      } else if (isBooked) {
                        tileClass = 'bg-[#fffbf0] border-amber-300 text-amber-900 shadow-2xs';
                      } else if (isAvailable) {
                        tileClass = 'bg-white border-slate-200/90 text-slate-700 shadow-2xs';
                      }

                      return (
                        <button
                          key={plot.id}
                          ref={(el) => {
                            if (el) plotElementsRef.current.set(plot.id, el);
                            else plotElementsRef.current.delete(plot.id);
                          }}
                          onClick={() => setSelected(plot)}
                          aria-label={`Plot ${plot.plotNumber}, ${plot.size} ${plot.sizeUnit}, ${plot.status}`}
                          className={`relative overflow-hidden rounded-[10px] border transition-all cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a3c6e] hover:shadow-md hover:border-slate-400 ${tileClass} h-[80px] min-w-[70px] sm:h-[88px] sm:min-w-[104px] flex-shrink-0`}
                        >
                          {/* Top-left label: Plot Number white pill */}
                          <div className="absolute top-1.5 left-1.5 z-10 bg-white/95 backdrop-blur-[2px] px-1.5 py-0.5 rounded shadow-2xs border border-slate-200/60 font-bold text-[11px] text-slate-800 leading-none select-none flex items-center gap-1">
                            <span>{plot.plotNumber}</span>
                            {isBooked && <Flag size={10} className="text-amber-600" />}
                          </div>

                          {/* Bottom-left label: Size pill (shown only on sm+ when tile >= 96px) */}
                          <div className="hidden sm:block absolute bottom-1.5 left-1.5 z-10 bg-white/90 backdrop-blur-[2px] px-1.5 py-0.5 rounded shadow-2xs border border-slate-200/50 text-[10px] text-slate-600 font-medium leading-none select-none">
                            {plot.size} {plot.sizeUnit}
                          </div>

                          {/* Sold Bungalow House Sprite */}
                          {isSold && enableHouses && (
                            <div className="absolute right-[2px] bottom-[2px] z-0 pointer-events-none select-none flex items-end justify-end">
                              <HouseSprite
                                plotId={plot.id}
                                variant={variant}
                                palette={palette}
                                heightClass="h-[74px] sm:h-[82px]"
                                mode={isCelebrating ? 'build' : 'static'}
                                onBuilt={() => handleCelebrationEnd(plot.id)}
                              />
                            </div>
                          )}
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Plot detail popup */}
      <Modal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title={`Plot ${selected?.plotNumber}`}
        size="md"
      >
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
                  <div className="text-xs text-slate-500 font-medium">{k}</div>
                  <div className="text-sm font-semibold text-slate-800 mt-0.5">{v}</div>
                </div>
              ))}
            </div>

            {selected.description && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="text-xs text-slate-500 font-medium">Description</div>
                <div className="text-sm text-slate-700 mt-1">{selected.description}</div>
              </div>
            )}

            {/* Buyer / Booking information if sold or booked */}
            {(selected.status === 'sold' || selected.status === 'booked') && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <h4 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <span>Customer & Financial Details</span>
                </h4>

                {detailsCache[selected.id]?.loading ? (
                  <div className="flex justify-center py-6">
                    <BrandLoader size={36} />
                  </div>
                ) : detailsCache[selected.id]?.sale || detailsCache[selected.id]?.booking ? (
                  <div ref={detailsRef} className="space-y-3">
                    {detailsCache[selected.id]?.customer && (
                      <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-200/60 flex items-start gap-3">
                        <div className="p-2 bg-amber-100 rounded-lg text-amber-800 mt-0.5">
                          <Home size={16} />
                        </div>
                        <div>
                          <div className="text-xs text-amber-800 font-medium">Purchaser</div>
                          <div className="text-sm font-bold text-slate-800">
                            {detailsCache[selected.id]?.customer?.name}
                          </div>
                          <div className="text-xs text-slate-600">
                            {detailsCache[selected.id]?.customer?.phone}
                          </div>
                        </div>
                      </div>
                    )}

                    {detailsCache[selected.id]?.sale && (
                      <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <div>
                          <span className="text-slate-500">Sale Date:</span>{' '}
                          <span className="font-semibold text-slate-800">
                            {new Date(
                              detailsCache[selected.id]!.sale!.saleDate
                            ).toLocaleDateString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Total Price:</span>{' '}
                          <span className="font-bold text-[#1a3c6e]">
                            {formatCurrency(detailsCache[selected.id]!.sale!.totalPrice)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic py-2">
                    No active sale record found for this plot.
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
