import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import {
  Printer, Download, Filter, ChevronDown, ChevronUp,
  FileBarChart, ChevronRight
} from 'lucide-react';
import { PageLoading, BrandLoader } from '../brand';
import { formatCurrency } from '../../utils/formatters';

export interface ReportKpi {
  label: string;
  value: number | string;
  isCurrency?: boolean;
  color?: 'red' | 'amber' | 'green' | 'navy' | 'blue';
  hint?: string;
}

export interface ReportLayoutProps {
  reportName: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  
  // Actions
  onPrint?: () => void;
  onExportCsv?: () => void;
  headerActions?: React.ReactNode;
  
  // Filters
  filterCard?: React.ReactNode;
  
  // KPI strip
  kpis?: ReportKpi[];
  
  // Extra top content (e.g. segmented control, charts)
  topContent?: React.ReactNode;
  
  // Loading & Main content
  loading?: boolean;
  children: React.ReactNode;
  
  // Footer row / summary
  footerContent?: React.ReactNode;
}

export function exportRowsToCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const sanitize = (val: string | number) => {
    const str = String(val ?? '').replace(/"/g, '""');
    return `"${str}"`;
  };
  const headerLine = headers.map(sanitize).join(',');
  const rowLines = rows.map(r => r.map(sanitize).join(','));
  const csvContent = [headerLine, ...rowLines].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function ReportLayout({
  reportName,
  title,
  subtitle,
  icon,
  onPrint,
  onExportCsv,
  headerActions,
  filterCard,
  kpis,
  topContent,
  loading = false,
  children,
  footerContent,
}: ReportLayoutProps) {
  const [filtersOpen, setFiltersOpen] = useState(true);
  const kpiRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // Count up animation for numeric KPIs
  useEffect(() => {
    if (!kpis || kpis.length === 0) return;
    kpis.forEach((kpi, idx) => {
      const el = kpiRefs.current[idx];
      if (!el) return;
      if (typeof kpi.value === 'number') {
        const targetVal = kpi.value;
        const obj = { val: 0 };
        gsap.to(obj, {
          val: targetVal,
          duration: 0.8,
          ease: 'power2.out',
          onUpdate: () => {
            if (el) {
              el.innerText = kpi.isCurrency
                ? formatCurrency(Math.round(obj.val))
                : Math.round(obj.val).toLocaleString();
            }
          }
        });
      } else {
        el.innerText = String(kpi.value);
      }
    });
  }, [kpis]);

  const getColorClasses = (color: ReportKpi['color'] = 'navy') => {
    switch (color) {
      case 'red':
        return {
          text: 'text-red-700',
          bg: 'bg-red-50/70',
          border: 'border-red-200',
          badge: 'bg-red-100 text-red-800'
        };
      case 'amber':
        return {
          text: 'text-amber-700',
          bg: 'bg-amber-50/70',
          border: 'border-amber-200',
          badge: 'bg-amber-100 text-amber-800'
        };
      case 'green':
        return {
          text: 'text-emerald-700',
          bg: 'bg-emerald-50/70',
          border: 'border-emerald-200',
          badge: 'bg-emerald-100 text-emerald-800'
        };
      case 'blue':
        return {
          text: 'text-blue-700',
          bg: 'bg-blue-50/70',
          border: 'border-blue-200',
          badge: 'bg-blue-100 text-blue-800'
        };
      case 'navy':
      default:
        return {
          text: 'text-slate-900',
          bg: 'bg-slate-50/80',
          border: 'border-slate-200',
          badge: 'bg-slate-200 text-slate-800'
        };
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Breadcrumb & Header ── */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between sm:items-center">
        <div>
          <nav className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
            <Link to="/reports" className="hover:text-primary hover:underline font-medium">
              Reports
            </Link>
            <ChevronRight size={12} className="text-slate-400" />
            <span className="text-slate-800 font-semibold">{reportName}</span>
          </nav>
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-sm flex-shrink-0"
              style={{ background: '#1a3c6e' }}
            >
              {icon || <FileBarChart size={18} />}
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-tight">{title}</h1>
              {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
          </div>
        </div>

        {/* Right-side action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {headerActions}
          {onExportCsv && (
            <button
              onClick={onExportCsv}
              className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-3"
              id="report-export-csv-btn"
            >
              <Download size={14} /> Export CSV
            </button>
          )}
          {onPrint && (
            <button
              onClick={onPrint}
              className="btn-primary text-xs flex items-center gap-1.5 py-2 px-3.5"
              id="report-print-btn"
            >
              <Printer size={14} /> Print Report
            </button>
          )}
        </div>
      </div>

      {/* ── Collapsible Filter Card ── */}
      {filterCard && (
        <div className="card !p-3 sm:!p-4 bg-white border border-slate-200">
          <div className="sm:hidden flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <button
              onClick={() => setFiltersOpen(o => !o)}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"
            >
              <Filter size={14} /> Filters
              {filtersOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
          <div className={filtersOpen ? 'block' : 'hidden sm:block'}>
            {filterCard}
          </div>
        </div>
      )}

      {/* ── KPI Strip (max 4 in 1 row) ── */}
      {kpis && kpis.length > 0 && (
        <div className={`grid grid-cols-2 ${kpis.length >= 4 ? 'lg:grid-cols-4' : kpis.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-3.5`}>
          {kpis.slice(0, 4).map((kpi, idx) => {
            const colors = getColorClasses(kpi.color);
            return (
              <div
                key={idx}
                className={`p-4 rounded-xl border ${colors.bg} ${colors.border} transition-all duration-200 hover:shadow-sm`}
              >
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">
                  {kpi.label}
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span
                    ref={el => { kpiRefs.current[idx] = el; }}
                    className={`text-xl font-extrabold tracking-tight ${colors.text}`}
                  >
                    {typeof kpi.value === 'number'
                      ? (kpi.isCurrency ? formatCurrency(kpi.value) : kpi.value.toLocaleString())
                      : kpi.value}
                  </span>
                </div>
                {kpi.hint && (
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">{kpi.hint}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Extra Top Content (Charts, Views Toggle) ── */}
      {topContent && (
        <div>{topContent}</div>
      )}

      {/* ── Main Data Card ── */}
      <div className="card !p-0 overflow-hidden border border-slate-200 bg-white">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <PageLoading />
            <BrandLoader size={56} />
            <p className="text-xs font-medium text-slate-400 mt-3">Loading report data...</p>
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto max-h-[640px]">
              {children}
            </div>
            {footerContent && (
              <div className="border-t border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-600">
                {footerContent}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
