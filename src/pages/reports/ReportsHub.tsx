import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import {
  BarChart2, BookOpen, Calendar, DollarSign, Receipt,
  AlertCircle, AlertTriangle, Home, Handshake, ChevronRight,
  TrendingUp, Layers, ShieldAlert, PieChart
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';

interface ReportCardItem {
  title: string;
  path: string;
  description: string;
  icon: React.ReactNode;
  tag?: string;
}

interface ReportGroup {
  groupName: string;
  icon: React.ReactNode;
  reports: ReportCardItem[];
}

const REPORT_GROUPS: ReportGroup[] = [
  {
    groupName: 'Sales & Bookings',
    icon: <TrendingUp size={16} className="text-blue-600" />,
    reports: [
      {
        title: 'Sale Report',
        path: '/reports/sales',
        description: 'Complete breakdown of completed and active plot sales by time period',
        icon: <BarChart2 size={20} className="text-blue-600" />,
      },
      {
        title: 'Booking Report',
        path: '/reports/bookings',
        description: 'Status tracking of confirmed, converted, and pending booking receipts',
        icon: <BookOpen size={20} className="text-indigo-600" />,
      },
    ],
  },
  {
    groupName: 'Collections & Cash Flow',
    icon: <DollarSign size={16} className="text-emerald-600" />,
    reports: [
      {
        title: 'Daily Report',
        path: '/reports/daily',
        description: 'Single-day operational snapshot of collections, new bookings, and sales',
        icon: <Calendar size={20} className="text-emerald-600" />,
      },
      {
        title: 'Collection Report',
        path: '/reports/collection',
        description: 'Financial breakdown by payment method: Cash, Bank Transfer, and Cheques',
        icon: <DollarSign size={20} className="text-teal-600" />,
      },
      {
        title: 'Installment Report',
        path: '/reports/installments',
        description: 'Tracking paid, pending, and partial installment schedule receipts',
        icon: <Receipt size={20} className="text-cyan-600" />,
      },
    ],
  },
  {
    groupName: 'Defaulters & Recovery',
    icon: <ShieldAlert size={16} className="text-rose-600" />,
    reports: [
      {
        title: 'Pending Payments',
        path: '/reports/pending',
        description: 'Outstanding payments with both customer and installment ledger views',
        icon: <AlertCircle size={20} className="text-amber-600" />,
        tag: 'Dual View',
      },
      {
        title: 'Shortage List',
        path: '/reports/shortage-list',
        description: 'Targeted overdue recovery list with direct WhatsApp reminder links',
        icon: <AlertTriangle size={20} className="text-rose-600" />,
        tag: 'Overdue Only',
      },
    ],
  },
  {
    groupName: 'Property Inventory',
    icon: <Layers size={16} className="text-violet-600" />,
    reports: [
      {
        title: 'Plot Status Report',
        path: '/reports/plot-status',
        description: 'Complete availability, block occupancy, and category statistics',
        icon: <Home size={20} className="text-violet-600" />,
      },
    ],
  },
  {
    groupName: 'Dealer Operations',
    icon: <Handshake size={16} className="text-amber-600" />,
    reports: [
      {
        title: 'Dealer Commission',
        path: '/reports/dealer-commission',
        description: 'Agent commission rates, earned amounts, and settlement statuses',
        icon: <Handshake size={20} className="text-amber-600" />,
      },
    ],
  },
];

export default function ReportsHub() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(
        '.report-hub-card',
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.35, stagger: 0.04, ease: 'power2.out' }
      );
    }
  }, []);

  return (
    <div className="space-y-6" ref={containerRef}>
      <PageHeader
        title="Reports Overview"
        subtitle="Business intelligence, financial summaries, and operations analytics"
        icon={<PieChart size={20} />}
      />

      <div className="space-y-8">
        {REPORT_GROUPS.map((group, gIdx) => (
          <div key={gIdx} className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200/80 pb-2">
              {group.icon}
              <span>{group.groupName}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.reports.map((report, rIdx) => (
                <Link
                  key={rIdx}
                  to={report.path}
                  className="report-hub-card group relative p-4 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-slate-300 transition-all duration-200 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2.5">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-200">
                        {report.icon}
                      </div>
                      {report.tag && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {report.tag}
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-sm text-slate-900 group-hover:text-primary transition-colors">
                      {report.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                      {report.description}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-primary">
                    <span className="group-hover:underline">Open Report</span>
                    <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform duration-200" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
