import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Search, Inbox, ArrowUpDown, ChevronRight as MoreIcon
} from 'lucide-react';
import { TableSkeleton } from './Skeleton';
import { useBreakpoint } from '../../hooks/useBreakpoint';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Column<T = any> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
  width?: string;
  mobile?: 'primary' | 'secondary' | 'badge' | 'detail' | 'hidden';
  hideBelow?: 'md' | 'lg' | 'xl';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Props<T = any> {
  columns: Column<T>[];
  data: T[];
  keyField?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  searchKeys?: (keyof any)[];
  searchPlaceholder?: string;
  pageSize?: number;
  emptyMessage?: string;
  loading?: boolean;
  extraFilters?: React.ReactNode;
  onRowClick?: (row: T) => void;
  stickyFirstColumn?: boolean;
  totalsFooter?: React.ReactNode;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DataTable<T extends Record<string, any>>({
  columns,
  data,
  keyField = 'id',
  searchKeys = [],
  searchPlaceholder = 'Search...',
  pageSize = 10,
  emptyMessage = 'No records found',
  loading = false,
  extraFilters,
  onRowClick,
  stickyFirstColumn = true,
  totalsFooter,
}: Props<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(pageSize);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [showScrollHint, setShowScrollHint] = useState(true);

  const { isMd, isLg, isXl } = useBreakpoint();
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Filter columns by hideBelow on larger viewports
  const visibleDesktopColumns = useMemo(() => {
    return columns.filter(col => {
      if (!col.hideBelow) return true;
      if (col.hideBelow === 'md') return isMd;
      if (col.hideBelow === 'lg') return isLg;
      if (col.hideBelow === 'xl') return isXl;
      return true;
    });
  }, [columns, isMd, isLg, isXl]);

  // Determine mobile categorization
  const { primaryCol, badgeCols, secondaryCols, actionCol } = useMemo(() => {
    let primary: Column<T> | null = null;
    const badges: Column<T>[] = [];
    const secondaries: Column<T>[] = [];
    let actions: Column<T> | null = null;

    columns.forEach((col, idx) => {
      if (col.mobile === 'hidden') return;

      const keyLower = col.key.toLowerCase();
      const isAction = col.mobile === 'detail' || keyLower.includes('action');
      const isBadge = col.mobile === 'badge' || keyLower.includes('status');

      if (isAction) {
        actions = col;
      } else if (col.mobile === 'primary' || (!primary && idx === 0)) {
        primary = col;
      } else if (isBadge) {
        badges.push(col);
      } else {
        secondaries.push(col);
      }
    });

    return {
      primaryCol: primary || columns[0],
      badgeCols: badges,
      secondaryCols: secondaries,
      actionCol: actions as Column<T> | null,
    };
  }, [columns]);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(row =>
      searchKeys.some(k => String(row[k as string] ?? '').toLowerCase().includes(q))
    );
  }, [data, search, searchKeys]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const cmp = String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''), undefined, {
        numeric: true,
      });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const curPage = Math.min(page, totalPages);
  const paginated = sorted.slice((curPage - 1) * perPage, curPage * perPage);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const onSearch = (v: string) => {
    setSearch(v);
    setPage(1);
  };

  const toggleCardExpansion = (id: string) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Dismiss horizontal swipe hint once scrolled
  const handleTableScroll = () => {
    if (showScrollHint) setShowScrollHint(false);
  };

  // Page numbers for desktop
  const pageNums = (() => {
    const pages: number[] = [];
    const start = Math.max(1, Math.min(curPage - 2, totalPages - 4));
    for (let i = start; i <= Math.min(start + 4, totalPages); i++) pages.push(i);
    return pages;
  })();

  return (
    <div className="space-y-4">
      {/* ── Controls ── */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 sm:gap-3 sm:items-center">
        {/* Full width search on mobile */}
        <div className="relative flex-1 min-w-[200px] w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="input-field pl-9 w-full min-h-[44px]"
          />
        </div>

        {extraFilters}

        {/* Mobile Sort By Select (below md) */}
        {!isMd && (
          <div className="flex items-center gap-2 w-full">
            <div className="relative flex-1">
              <select
                value={sortKey ? `${sortKey}:${sortDir}` : ''}
                onChange={e => {
                  const val = e.target.value;
                  if (!val) {
                    setSortKey('');
                  } else {
                    const [k, d] = val.split(':');
                    setSortKey(k);
                    setSortDir(d as 'asc' | 'desc');
                  }
                  setPage(1);
                }}
                className="input-field min-h-[44px] text-xs font-medium"
              >
                <option value="">Sort by: Default</option>
                {columns
                  .filter(c => c.sortable !== false && c.label)
                  .map(c => (
                    <React.Fragment key={c.key}>
                      <option value={`${c.key}:asc`}>{c.label} (Ascending)</option>
                      <option value={`${c.key}:desc`}>{c.label} (Descending)</option>
                    </React.Fragment>
                  ))}
              </select>
            </div>
            <select
              value={perPage}
              onChange={e => {
                setPerPage(Number(e.target.value));
                setPage(1);
              }}
              className="input-field w-28 min-h-[44px] text-xs"
            >
              {[10, 25, 50].map(n => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Desktop per page select (from md) */}
        {isMd && (
          <select
            value={perPage}
            onChange={e => {
              setPerPage(Number(e.target.value));
              setPage(1);
            }}
            className="input-field w-28 min-h-[40px] text-xs"
          >
            {[10, 25, 50, 100].map(n => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ── Mobile Card List (below md) ── */}
      {!isMd && (
        <div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(n => (
                <div key={n} className="card p-4 space-y-3 animate-pulse bg-slate-100 rounded-xl" />
              ))}
            </div>
          ) : paginated.length === 0 ? (
            <div className="card p-10 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
              <Inbox size={32} className="text-slate-400 stroke-1" />
              <span>{emptyMessage}</span>
            </div>
          ) : (
            <ul className="space-y-3" role="list">
              {paginated.map((row, idx) => {
                const rowKey = String(row[keyField] ?? idx);
                const isExpanded = expandedCards[rowKey] || false;
                const visibleSecondaries = isExpanded ? secondaryCols : secondaryCols.slice(0, 4);

                return (
                  <li
                    key={rowKey}
                    className="card p-4 space-y-3 bg-white rounded-xl border border-slate-200 shadow-sm relative transition-all"
                  >
                    {/* Header: Primary Title + Badges */}
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div
                        className={`min-w-0 flex-1 ${onRowClick ? 'cursor-pointer' : ''}`}
                        onClick={() => onRowClick?.(row)}
                      >
                        <h4 className="font-bold text-sm text-[#1a3c6e] break-anywhere">
                          {primaryCol.render ? primaryCol.render(row) : String(row[primaryCol.key] ?? '—')}
                        </h4>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
                        {badgeCols.map(bc => (
                          <div key={bc.key}>
                            {bc.render ? bc.render(row) : String(row[bc.key] ?? '')}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Secondary fields (2-column grid) */}
                    {secondaryCols.length > 0 && (
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs pt-0.5">
                        {visibleSecondaries.map(col => (
                          <div key={col.key} className="min-w-0">
                            <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">
                              {col.label}
                            </span>
                            <span className="font-medium text-slate-700 break-anywhere block mt-0.5">
                              {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Expand/Collapse more fields button if > 4 secondary fields */}
                    {secondaryCols.length > 4 && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => toggleCardExpansion(rowKey)}
                          className="text-[11px] font-semibold text-[#1a3c6e] hover:underline flex items-center gap-1 py-1"
                        >
                          {isExpanded
                            ? 'Show less'
                            : `+${secondaryCols.length - 4} more details`}
                        </button>
                      </div>
                    )}

                    {/* Actions row at bottom (44px touch targets) */}
                    {actionCol && (
                      <div className="pt-2.5 border-t border-slate-100 flex items-center justify-end gap-2">
                        {actionCol.render ? actionCol.render(row) : null}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* ── Desktop Table (from md) ── */}
      {isMd && (
        <div className="rounded-xl border border-slate-200 overflow-hidden shadow-card bg-white relative">
          {/* Scroll hint for wide tables on tablet */}
          {showScrollHint && !isLg && (
            <div className="text-[10px] text-slate-400 bg-slate-50 border-b border-slate-100 px-3 py-1 flex items-center justify-between">
              <span>Scroll horizontally to view more columns</span>
              <button onClick={() => setShowScrollHint(false)} className="hover:text-slate-600 font-bold">
                Dismiss
              </button>
            </div>
          )}

          <div
            ref={tableContainerRef}
            onScroll={handleTableScroll}
            className="overflow-x-auto relative"
          >
            <table className="w-full text-sm">
              {/* Sticky header */}
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                <tr>
                  {visibleDesktopColumns.map((col, idx) => {
                    const isFirst = idx === 0 && stickyFirstColumn;
                    return (
                      <th
                        key={col.key}
                        className={`table-th whitespace-nowrap ${
                          isFirst ? 'sticky left-0 bg-slate-50 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.04)]' : ''
                        } ${col.sortable !== false ? 'cursor-pointer hover:bg-slate-100 select-none' : ''} ${
                          col.className || ''
                        }`}
                        style={col.width ? { width: col.width } : undefined}
                        onClick={() => col.sortable !== false && toggleSort(col.key)}
                      >
                        <div className="flex items-center gap-1">
                          {col.label}
                          {col.sortable !== false && sortKey === col.key && (
                            <span className="text-accent">
                              {sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <TableSkeleton rows={6} cols={visibleDesktopColumns.length} />
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={visibleDesktopColumns.length} className="py-16 text-center text-slate-400 text-sm">
                      <div className="flex flex-col items-center gap-2">
                        <Inbox size={32} className="text-slate-400 stroke-1" />
                        <span>{emptyMessage}</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <AnimatePresence initial={false}>
                    {paginated.map((row, idx) => (
                      <motion.tr
                        key={String(row[keyField] ?? idx)}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.18, delay: idx * 0.02 }}
                        className={`table-row group ${onRowClick ? 'cursor-pointer' : ''}`}
                        onClick={() => onRowClick?.(row)}
                      >
                        {visibleDesktopColumns.map((col, colIdx) => {
                          const isFirst = colIdx === 0 && stickyFirstColumn;
                          return (
                            <td
                              key={col.key}
                              className={`table-td ${
                                isFirst
                                  ? 'sticky left-0 bg-white group-hover:bg-[#eff6ff] z-10 shadow-[2px_0_4px_rgba(0,0,0,0.04)]'
                                  : ''
                              } ${col.className || ''}`}
                            >
                              {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                            </td>
                          );
                        })}
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                )}
              </tbody>

              {/* Totals footer if provided */}
              {totalsFooter && (
                <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-xs text-slate-800">
                  {totalsFooter}
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── Pagination ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 pt-1">
        <span>
          {sorted.length === 0
            ? 'No records'
            : `Showing ${(curPage - 1) * perPage + 1}–${Math.min(
                curPage * perPage,
                sorted.length
              )} of ${sorted.length}`}
        </span>

        {/* Compact pagination on phones, full numeric pagination on sm+ */}
        {!isMd ? (
          <div className="flex items-center gap-3 w-full justify-between sm:w-auto">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={curPage === 1}
              aria-label="Previous page"
              className="btn btn-secondary text-xs min-h-[44px] px-3.5 flex items-center gap-1.5 disabled:opacity-40"
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <span className="font-semibold text-slate-700">
              Page {curPage} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={curPage === totalPages}
              aria-label="Next page"
              className="btn btn-secondary text-xs min-h-[44px] px-3.5 flex items-center gap-1.5 disabled:opacity-40"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={curPage === 1}
              aria-label="Previous page"
              className="btn-icon hover:bg-slate-100 disabled:opacity-40 text-slate-600"
            >
              <ChevronLeft size={15} />
            </button>
            {pageNums.map(pg => (
              <button
                key={pg}
                onClick={() => setPage(pg)}
                className={`w-7 h-7 rounded-lg text-xs font-semibold transition-all
                  ${
                    pg === curPage
                      ? 'text-white shadow-sm'
                      : 'hover:bg-slate-100 text-slate-600'
                  }`}
                style={pg === curPage ? { background: '#1a3c6e' } : undefined}
              >
                {pg}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={curPage === totalPages}
              aria-label="Next page"
              className="btn-icon hover:bg-slate-100 disabled:opacity-40 text-slate-600"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default DataTable;
