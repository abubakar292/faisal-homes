import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useScrollLock } from '../../hooks/useScrollLock';

export interface Option {
  value: string;
  label: string;
  sublabel?: string;
}

export interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  className?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  error = false,
  id,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placeAbove: boolean;
  } | null>(null);

  const { isSm } = useBreakpoint();
  useScrollLock(!isSm && open);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const uniqueId = useId();
  const selectId = id || uniqueId;

  const selected = options.find(o => o.value === value);

  const filtered = search.trim()
    ? options.filter(
        o =>
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          o.sublabel?.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  // Calculate portal position on desktop
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !isSm) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const placeAbove = spaceBelow < 220 && spaceAbove > spaceBelow;

    const availableHeight = placeAbove ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(320, Math.max(120, availableHeight));

    setDropdownPosition({
      top: placeAbove ? rect.top - maxHeight - 4 : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      width: rect.width,
      maxHeight,
      placeAbove,
    });
  }, [isSm]);

  useEffect(() => {
    if (open && isSm) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [open, isSm, updatePosition]);

  // Focus search input when opened
  useEffect(() => {
    if (open) {
      setHighlightedIndex(-1);
      setTimeout(() => inputRef.current?.focus(), 60);
    } else {
      setSearch('');
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        listRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
        onChange(filtered[highlightedIndex].value);
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
  };

  const selectOption = (optValue: string) => {
    onChange(optValue);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
      <button
        id={selectId}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={placeholder}
        className={`input-field flex items-center justify-between text-left w-full min-h-[44px]
          ${error ? 'input-error' : ''}
          ${disabled ? 'bg-slate-50 cursor-not-allowed opacity-70' : 'cursor-pointer'}
        `}
      >
        <span className={`truncate mr-2 ${selected ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear selection"
              onClick={e => {
                e.stopPropagation();
                onChange('');
              }}
              className="p-1 hover:text-red-500 text-slate-300 rounded transition-colors"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown
            size={16}
            className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Mobile Bottom Sheet (< 640px) */}
      <AnimatePresence>
        {open && !isSm && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={placeholder}
            className="fixed inset-0 z-50 flex items-end justify-center"
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />

            {/* Bottom Sheet Panel */}
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              className="relative z-10 w-full max-h-[85dvh] bg-white rounded-t-2xl shadow-2xl flex flex-col overflow-hidden fixed inset-x-0 bottom-0"
              style={{
                paddingBottom: 'calc(1rem + var(--safe-bottom))',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Drag Handle */}
              <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto my-2.5 flex-shrink-0" />

              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
                <span className="font-bold text-sm text-slate-800">{placeholder}</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close select"
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Pinned Search Box (16px font to prevent iOS zoom) */}
              <div className="p-3 border-b border-slate-100 bg-slate-50 flex-shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    ref={inputRef}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search options..."
                    className="w-full text-base pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3c6e]"
                    style={{ fontSize: '16px' }}
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Large Tap Rows (min 48px) */}
              <div className="overflow-y-auto flex-1 overscroll-contain divide-y divide-slate-100" role="listbox">
                {filtered.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-400">No options found</div>
                ) : (
                  filtered.map((opt, idx) => {
                    const isSelected = opt.value === value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => selectOption(opt.value)}
                        className={`w-full text-left px-4 py-3.5 min-h-[48px] flex items-center justify-between transition-colors active:bg-slate-100 ${
                          isSelected ? 'bg-primary/5 text-primary font-semibold' : 'text-slate-700'
                        }`}
                      >
                        <div className="min-w-0 pr-3">
                          <div className="text-sm font-medium">{opt.label}</div>
                          {opt.sublabel && (
                            <div className="text-xs text-slate-400 mt-0.5">{opt.sublabel}</div>
                          )}
                        </div>
                        {isSelected && <Check size={18} className="text-[#1a3c6e] flex-shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Desktop Portal Dropdown (>= 640px) */}
      {open && isSm && dropdownPosition && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden flex flex-col"
            style={{
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`,
              maxHeight: `${dropdownPosition.maxHeight}px`,
            }}
          >
            {/* Search Box */}
            <div className="p-2 border-b border-slate-100 bg-slate-50 flex-shrink-0">
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

            {/* Options List */}
            <div className="overflow-y-auto flex-1 py-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-5 text-center text-xs text-slate-400">No options found</div>
              ) : (
                filtered.map((opt, idx) => {
                  const isSelected = opt.value === value;
                  const isHighlighted = idx === highlightedIndex;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => selectOption(opt.value)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`w-full text-left px-3 py-2 transition-colors flex items-center justify-between text-xs
                        ${
                          isSelected
                            ? 'bg-primary/5 text-primary font-semibold'
                            : isHighlighted
                            ? 'bg-slate-50 text-slate-800'
                            : 'text-slate-700'
                        }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-medium truncate">{opt.label}</div>
                        {opt.sublabel && (
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            {opt.sublabel}
                          </div>
                        )}
                      </div>
                      {isSelected && <Check size={14} className="text-[#1a3c6e] flex-shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default SearchableSelect;
