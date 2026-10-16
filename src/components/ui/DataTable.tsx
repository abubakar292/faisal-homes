import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { TableSkeleton } from './Skeleton';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Column<T = any> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
  width?: string;
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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DataTable<T extends Record<string, any>>({
  columns, data, keyField = 'id',
  searchKeys = [], searchPlaceholder = 'Search...',
  pageSize = 10, emptyMessage = 'No records found',
  loading = false, extraFilters, onRowClick,
}: Props<T>) {
  const [search, setSearch]     = useState('');
  const [sortKey, setSortKey]   = useState('');
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('asc');
  const [page, setPage]         = useState(1);
  const [perPage, setPerPage]   = useState(pageSize);

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
      const cmp = String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages  = Math.max(1, Math.ceil(sorted.length / perPage));
  const curPage     = Math.min(page, totalPages);
  const paginated   = sorted.slice((curPage - 1) * perPage, curPage * perPage);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const onSearch = (v: string) => { setSearch(v); setPage(1); };

  /* page buttons */
  const pageNums = (() => {
    const pages: number[] = [];
    const start = Math.max(1, Math.min(curPage - 2, totalPages - 4));
    for (let i = start; i <= Math.min(start + 4, totalPages); i++) pages.push(i);
    return pages;
  })();

  return (
    <div className="space-y-4">
      {/* ── Controls ── */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="input-field pl-9"
          />
        </div>
        {extraFilters}
        <select
          value={perPage}
          onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
          className="input-field w-28"
        >
          {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
        </select>
      </div>

      {/* ── Table ── */}
      <div className="rounded-xl border border-slate-200 overflow-hidden shadow-card bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            {/* Sticky header */}
            <thead className="sticky top-0 z-10">
              <tr>
                {columns.map(col => (
                  <th
                    key={col.key}
                    className={`table-th whitespace-nowrap ${col.sortable !== false ? 'cursor-pointer hover:bg-slate-100 select-none' : ''} ${col.className || ''}`}
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
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <TableSkeleton rows={6} cols={columns.length} />
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-16 text-center text-slate-400 text-sm">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-3xl">📭</span>
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
                      {columns.map(col => (
                        <td
                          key={col.key}
                          className={`table-td ${col.className || ''}`}
                        >
                          {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                        </td>
                      ))}
                    </motion.tr>
                  ))}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ── */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {sorted.length === 0
            ? 'No records'
            : `Showing ${(curPage - 1) * perPage + 1}–${Math.min(curPage * perPage, sorted.length)} of ${sorted.length}`
          }
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={curPage === 1}
            className="btn-icon hover:bg-slate-100 disabled:opacity-40 text-slate-600"
          >
            <ChevronLeft size={15} />
          </button>
          {pageNums.map(pg => (
            <button
              key={pg}
              onClick={() => setPage(pg)}
              className={`w-7 h-7 rounded-lg text-xs font-semibold transition-all
                ${pg === curPage
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
            className="btn-icon hover:bg-slate-100 disabled:opacity-40 text-slate-600"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default DataTable;
