import React from 'react';
import { Check, AlertCircle } from 'lucide-react';

export type SectionStatus = 'pending' | 'complete' | 'attention';

export interface SectionNavItem {
  id: string;
  number: number;
  label: string;
  status: SectionStatus;
}

interface SectionNavProps {
  items: SectionNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

export const SectionNav: React.FC<SectionNavProps> = ({
  items,
  activeId,
  onSelect,
}) => {
  return (
    <>
      {/* ── Mobile & Tablet Sticky Horizontal Chip Bar (< xl) ── */}
      <nav
        className="xl:hidden sticky top-14 sm:top-16 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200/90 py-2.5 px-3 overflow-x-auto flex items-center gap-2 no-scrollbar shadow-xs -mx-3 sm:-mx-5 lg:-mx-6 mb-4"
        aria-label="Section Quick Navigation"
      >
        {items.map(item => {
          const isActive = activeId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all min-h-[36px] ${
                isActive
                  ? 'bg-[#1a3c6e] text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-white text-slate-700'
                }`}
              >
                {item.number}
              </span>
              <span>{item.label}</span>
              {item.status === 'complete' && (
                <Check size={12} strokeWidth={3} className={isActive ? 'text-emerald-300' : 'text-emerald-600'} />
              )}
              {item.status === 'attention' && (
                <AlertCircle size={12} strokeWidth={2.5} className={isActive ? 'text-rose-300' : 'text-rose-600'} />
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Desktop Vertical Sidebar (xl+) ── */}
      <aside
        className="hidden xl:block w-48 sticky top-20 self-start space-y-1.5 p-2 bg-white/80 backdrop-blur rounded-2xl border border-slate-200/80 shadow-sm"
        aria-label="Section Navigation"
      >
        <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Sections
        </div>
        <nav className="space-y-1">
          {items.map(item => {
            const isActive = activeId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl transition-all text-left ${
                  isActive
                    ? 'bg-[#1a3c6e] text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.number}
                  </span>
                  <span className="truncate">{item.label}</span>
                </div>

                {item.status === 'complete' && (
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center ${
                      isActive ? 'text-emerald-300' : 'text-emerald-600'
                    }`}
                    title="Section complete"
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}

                {item.status === 'attention' && (
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center ${
                      isActive ? 'text-rose-300' : 'text-rose-600'
                    }`}
                    title="Needs attention"
                  >
                    <AlertCircle size={12} strokeWidth={2.5} />
                  </span>
                )}

                {item.status === 'pending' && (
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isActive ? 'bg-white/40' : 'bg-slate-300'
                    }`}
                    title="Pending"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
};

export default SectionNav;
