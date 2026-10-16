import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

interface Option { value: string; label: string; sublabel?: string; }

interface Props {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
}

const SearchableSelect: React.FC<Props> = ({
  options, value, onChange, placeholder = 'Select...', disabled = false, error = false,
}) => {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);

  const filtered = search.trim()
    ? options.filter(o =>
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        o.sublabel?.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`input-field flex items-center justify-between text-left w-full
          ${error ? 'input-error' : ''}
          ${disabled ? 'bg-slate-50 cursor-not-allowed opacity-70' : 'cursor-pointer'}
        `}
      >
        <span className={selected ? 'text-slate-800' : 'text-slate-400'}>
          {selected ? selected.label : placeholder}
        </span>
        <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
          {value && !disabled && (
            <span
              onClick={e => { e.stopPropagation(); onChange(''); }}
              className="p-0.5 hover:text-red-400 text-slate-300 rounded transition-colors"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown
            size={14}
            className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-card-lg overflow-hidden">
          {/* Search box */}
          <div className="p-2 border-b border-slate-100 bg-slate-50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
              <input
                ref={inputRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full text-xs pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-primary bg-white"
              />
            </div>
          </div>

          {/* Options */}
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-5 text-center text-xs text-slate-400">No options found</div>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); setSearch(''); }}
                  className={`w-full text-left px-3 py-2.5 transition-colors
                    ${opt.value === value
                      ? 'bg-primary/5 text-primary'
                      : 'text-slate-700 hover:bg-slate-50'
                    }`}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  {opt.sublabel && (
                    <div className="text-[11px] text-slate-400 mt-0.5">{opt.sublabel}</div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
