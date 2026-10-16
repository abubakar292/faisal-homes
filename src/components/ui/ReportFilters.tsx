import React, { useState, useEffect } from 'react';
import { Search, Calendar, Filter, X } from 'lucide-react';

export interface DateRange {
  start: Date | null;
  end: Date | null;
}

interface ReportFiltersProps {
  search: string;
  onSearchChange: (val: string) => void;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  searchPlaceholder?: string;
  extraFilters?: React.ReactNode;
  actions?: React.ReactNode;
  activeFiltersCount?: number;
  onClearFilters?: () => void;
}

type Preset = 'Today' | 'Yesterday' | 'This week' | 'This month' | 'Last month' | 'Last 30 days' | 'This year' | 'Custom';

const ReportFilters: React.FC<ReportFiltersProps> = ({
  search,
  onSearchChange,
  dateRange,
  onDateRangeChange,
  searchPlaceholder = "Search...",
  extraFilters,
  actions,
  activeFiltersCount = 0,
  onClearFilters
}) => {
  const [preset, setPreset] = useState<Preset>('This month');
  const [showCustom, setShowCustom] = useState(false);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === 'Custom') {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    switch (p) {
      case 'Today':
        break;
      case 'Yesterday':
        start.setDate(start.getDate() - 1);
        end.setDate(end.getDate() - 1);
        break;
      case 'This week':
        start.setDate(start.getDate() - start.getDay());
        break;
      case 'This month':
        start.setDate(1);
        break;
      case 'Last month':
        start.setMonth(start.getMonth() - 1);
        start.setDate(1);
        end.setDate(0);
        break;
      case 'Last 30 days':
        start.setDate(start.getDate() - 30);
        break;
      case 'This year':
        start.setMonth(0, 1);
        break;
    }
    onDateRangeChange({ start, end });
  };

  // Run on mount to initialize date range if not set
  useEffect(() => {
    if (!dateRange.start && !dateRange.end && preset !== 'Custom') {
      applyPreset(preset);
    }
  }, []);

  const handleCustomDate = (field: 'start' | 'end', val: string) => {
    const d = val ? new Date(val) : null;
    if (d && field === 'start') {
      d.setHours(0, 0, 0, 0);
    } else if (d && field === 'end') {
      d.setHours(23, 59, 59, 999);
    }
    onDateRangeChange({ ...dateRange, [field]: d });
  };

  const formatDateString = (d: Date | null) => d ? d.toISOString().split('T')[0] : '';

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 space-y-4">
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
        {/* Search */}
        <div className="relative w-full lg:w-96 flex-shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
          {search && (
            <button onClick={() => onSearchChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filters Right Side */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {extraFilters}

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1">
            <Calendar size={16} className="text-slate-400 ml-2" />
            <select
              value={preset}
              onChange={e => applyPreset(e.target.value as Preset)}
              className="bg-transparent text-sm border-none focus:ring-0 text-slate-700 py-1 pl-1 pr-8 outline-none"
            >
              <option value="Today">Today</option>
              <option value="Yesterday">Yesterday</option>
              <option value="This week">This week</option>
              <option value="This month">This month</option>
              <option value="Last month">Last month</option>
              <option value="Last 30 days">Last 30 days</option>
              <option value="This year">This year</option>
              <option value="Custom">Custom Range...</option>
            </select>
          </div>

          {actions && <div className="flex gap-2 ml-auto lg:ml-2">{actions}</div>}
        </div>
      </div>

      {showCustom && (
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 animate-in slide-in-from-top-2">
          <span className="text-sm font-medium text-slate-600">Custom Range:</span>
          <input
            type="date"
            value={formatDateString(dateRange.start)}
            onChange={e => handleCustomDate('start', e.target.value)}
            className="text-sm border border-slate-200 rounded-md px-3 py-1.5 focus:border-blue-500 outline-none"
          />
          <span className="text-slate-400 text-sm">to</span>
          <input
            type="date"
            value={formatDateString(dateRange.end)}
            onChange={e => handleCustomDate('end', e.target.value)}
            className="text-sm border border-slate-200 rounded-md px-3 py-1.5 focus:border-blue-500 outline-none"
          />
        </div>
      )}

      {(activeFiltersCount > 0 || preset !== 'This month') && (
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <Filter size={14} /> Active Filters:
          </div>
          {preset !== 'This month' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
              Date: {preset}
              <button onClick={() => applyPreset('This month')} className="hover:text-blue-900"><X size={12}/></button>
            </span>
          )}
          {activeFiltersCount > 0 && onClearFilters && (
            <button onClick={onClearFilters} className="text-xs text-slate-500 hover:text-slate-800 underline ml-2">
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ReportFilters;
