import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Empty } from './ui.jsx';

/**
 * Generic table with search, sorting and pagination (client side).
 * columns: [{ key, header, render?(row), value?(row) (for sort/search), align: 'right', className, sortable=true }]
 */
export default function DataTable({ columns, rows, searchable = true, searchPlaceholder = 'Search…', pageSize = 25, onRowClick, empty = 'No records found.', toolbar, footer, rowClass, initialSort }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(initialSort || null);
  const [page, setPage] = useState(0);
  const val = (c, r) => (c.value ? c.value(r) : r[c.key]);

  const filtered = useMemo(() => {
    const list = rows || [];
    if (!q.trim()) return list;
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return list.filter((r) => {
      const hay = columns.map((c) => { const v = val(c, r); return v === null || v === undefined ? '' : String(v); }).join(' ').toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [rows, q, columns]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const c = columns.find((x) => x.key === sort.key);
    if (!c) return filtered;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = val(c, a); const vb = val(c, b);
      const na = Number(va); const nb = Number(vb);
      if (va !== null && vb !== null && va !== '' && vb !== '' && Number.isFinite(na) && Number.isFinite(nb)) return (na - nb) * dir;
      return String(va ?? '').localeCompare(String(vb ?? ''), undefined, { numeric: true }) * dir;
    });
  }, [filtered, sort, columns]); // eslint-disable-line react-hooks/exhaustive-deps

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const visible = sorted.slice(cur * pageSize, cur * pageSize + pageSize);
  const toggle = (c) => {
    if (c.sortable === false) return;
    setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'asc' }));
  };

  return (
    <div className="card overflow-hidden">
      {(searchable || toolbar) && (
        <div className="flex flex-col gap-2 border-b border-slate-100 p-3 sm:flex-row sm:items-center">
          {searchable && (
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder={searchPlaceholder} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
            </div>
          )}
          {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`th ${c.align === 'right' ? 'text-right' : ''} ${c.sortable === false ? '' : 'cursor-pointer select-none hover:text-slate-800'} ${c.headClass || ''}`} onClick={() => toggle(c)}>
                  <span className="inline-flex items-center gap-1">
                    {c.header}
                    {sort?.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {visible.map((r, i) => (
              <tr key={r.id ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={`${onRowClick ? 'cursor-pointer hover:bg-navy-50/50' : ''} ${rowClass ? rowClass(r) : ''}`}>
                {columns.map((c) => (
                  <td key={c.key} className={`td ${c.align === 'right' ? 'num' : ''} ${c.className || ''}`}>{c.render ? c.render(r) : (r[c.key] ?? '—')}</td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && <tfoot className="bg-slate-50 font-semibold">{footer}</tfoot>}
        </table>
        {!visible.length && <Empty text={q ? 'No records match your search.' : empty} />}
      </div>
      {sorted.length > pageSize && (
        <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-sm text-slate-600">
          <span>{cur * pageSize + 1}–{Math.min(sorted.length, (cur + 1) * pageSize)} of {sorted.length}</span>
          <div className="flex gap-1">
            <button type="button" className="btn-secondary btn-sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" className="btn-secondary btn-sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
      {sorted.length > 0 && sorted.length <= pageSize && <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">{sorted.length} record{sorted.length === 1 ? '' : 's'}</div>}
    </div>
  );
}
