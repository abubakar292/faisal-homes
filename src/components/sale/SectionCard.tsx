import React, { useRef, useLayoutEffect } from 'react';
import { Check, AlertCircle, ChevronDown } from 'lucide-react';
import gsap from 'gsap';
import type { SectionStatus } from './SectionNav';

interface SectionCardProps {
  id: string;
  number: number;
  title: string;
  status: SectionStatus;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
  className?: string;
}

export const SectionCard: React.FC<SectionCardProps> = ({
  id,
  number,
  title,
  status,
  children,
  collapsible = false,
  isExpanded = true,
  onToggle,
  className = '',
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Smooth height animation with GSAP on toggle
  useLayoutEffect(() => {
    if (!collapsible || !contentRef.current) return;

    if (isExpanded) {
      gsap.to(contentRef.current, {
        height: 'auto',
        opacity: 1,
        duration: 0.35,
        ease: 'power2.out',
        clearProps: 'height',
      });
    } else {
      gsap.to(contentRef.current, {
        height: 0,
        opacity: 0,
        duration: 0.25,
        ease: 'power2.inOut',
      });
    }
  }, [isExpanded, collapsible]);

  return (
    <section
      id={id}
      ref={cardRef}
      className={`sale-section-card bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-6 scroll-mt-20 sm:scroll-mt-24 transition-all duration-200 hover:border-slate-300 ${className}`}
    >
      <header
        className={`flex items-center justify-between gap-3 ${
          collapsible ? 'cursor-pointer select-none' : ''
        }`}
        onClick={collapsible && onToggle ? onToggle : undefined}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shadow-sm"
            style={{ background: '#1a3c6e', color: '#e7b861' }}
          >
            {number}
          </div>
          <h2 className="text-base sm:text-lg font-bold text-slate-800">
            {title}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {status === 'complete' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Check size={12} strokeWidth={2.5} /> Complete
            </span>
          )}

          {status === 'attention' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
              <AlertCircle size={12} strokeWidth={2.5} /> Needs attention
            </span>
          )}

          {status === 'pending' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
              Pending
            </span>
          )}

          {collapsible && (
            <button
              type="button"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label={isExpanded ? 'Collapse section' : 'Expand section'}
            >
              <ChevronDown
                size={18}
                className={`transition-transform duration-200 ${
                  isExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>
          )}
        </div>
      </header>

      <div
        ref={contentRef}
        style={collapsible && !isExpanded ? { height: 0, opacity: 0, overflow: 'hidden' } : undefined}
        className={collapsible ? 'overflow-hidden' : ''}
      >
        <div className="pt-5 border-t border-slate-100 mt-4">
          {children}
        </div>
      </div>
    </section>
  );
};

export default SectionCard;
