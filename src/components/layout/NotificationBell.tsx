import React, { useEffect, useState, useMemo } from 'react';
import { Bell, AlertCircle, Clock, DollarSign, ChevronRight } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLiveCollection } from '../../data/liveStore';
import { formatCurrency } from '../../utils/formatters';
import {
  isInstallmentOverdue,
  isInstallmentDueSoon,
  getInstallmentOutstanding,
} from '../../domain/metrics';
import type { Installment, Sale, Customer, Plot } from '../../types';

interface Notification {
  id: string;
  type: 'overdue' | 'due_soon' | 'down_payment_pending';
  title: string;
  message: string;
  icon: React.ReactNode;
  color: string;
  route: string;
  isRead: boolean;
}

const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const { data: installments } = useLiveCollection<Installment>('installments');
  const { data: sales } = useLiveCollection<Sale>('sales');
  const { data: customers } = useLiveCollection<Customer>('customers');
  const { data: plots } = useLiveCollection<Plot>('plots');

  // Close on route change
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const notifications = useMemo(() => {
    const notifs: Notification[] = [];
    const customerMap = new Map(customers.map(c => [c.id, c]));
    const activeSaleIds = new Set(sales.filter(s => s.status !== 'cancelled').map(s => s.id));

    // 1. Overdue installments (strictly active sales and non-down-payment)
    const overdueInsts = installments.filter(i => {
      if (!activeSaleIds.has(i.saleId)) return false;
      return isInstallmentOverdue(i);
    });

    // Group overdue by customer for cleaner notifications
    const overdueByCustomer = new Map<string, { count: number; total: number; name: string }>();
    overdueInsts.forEach(inst => {
      const c = customerMap.get(inst.customerId);
      const key = inst.customerId;
      const existing = overdueByCustomer.get(key) || { count: 0, total: 0, name: c?.name || 'Unknown' };
      existing.count++;
      existing.total += getInstallmentOutstanding(inst);
      overdueByCustomer.set(key, existing);
    });

    overdueByCustomer.forEach((data, customerId) => {
      notifs.push({
        id: `overdue-${customerId}`,
        type: 'overdue',
        title: 'Overdue Payments',
        message: `${data.name} - ${data.count} installment${data.count > 1 ? 's' : ''} (${formatCurrency(data.total)})`,
        icon: <AlertCircle size={14} />,
        color: '#dc2626',
        route: '/reports/shortage-list',
        isRead: readIds.has(`overdue-${customerId}`),
      });
    });

    // 2. Due in 7 days
    const dueSoon = installments.filter(i => {
      if (!activeSaleIds.has(i.saleId)) return false;
      return isInstallmentDueSoon(i);
    });

    if (dueSoon.length > 0) {
      const totalDueSoon = dueSoon.reduce((s, i) => s + getInstallmentOutstanding(i), 0);
      notifs.push({
        id: 'due-soon-all',
        type: 'due_soon',
        title: 'Payments Due Soon',
        message: `${dueSoon.length} installment${dueSoon.length > 1 ? 's' : ''} due within 7 days (${formatCurrency(totalDueSoon)})`,
        icon: <Clock size={14} />,
        color: '#d97706',
        route: '/reports/pending',
        isRead: readIds.has('due-soon-all'),
      });
    }

    // 3. Pending down payments
    const activeSales = sales.filter(s => s.status !== 'cancelled');
    const pendingDP = activeSales.filter(s => {
      if (s.downPaymentStatus === 'complete') return false;
      const totalRequired = s.downPaymentAmount || 0;
      const totalReceived = (s.bookingAmountPaid || 0) + (s.downPaymentReceived || 0);
      const remaining = s.remainingDownPayment !== undefined ? s.remainingDownPayment : Math.max(0, totalRequired - totalReceived);
      return remaining > 0;
    });

    if (pendingDP.length > 0) {
      const totalPendingDP = pendingDP.reduce((s, sale) => {
        const totalRequired = sale.downPaymentAmount || 0;
        const totalReceived = (sale.bookingAmountPaid || 0) + (sale.downPaymentReceived || 0);
        const remaining = sale.remainingDownPayment !== undefined ? sale.remainingDownPayment : Math.max(0, totalRequired - totalReceived);
        return s + remaining;
      }, 0);
      notifs.push({
        id: 'dp-pending-all',
        type: 'down_payment_pending',
        title: 'Down Payments Pending',
        message: `${pendingDP.length} sale${pendingDP.length > 1 ? 's' : ''} with pending down payments (${formatCurrency(totalPendingDP)})`,
        icon: <DollarSign size={14} />,
        color: '#0369a1',
        route: '/payments/down-payments',
        isRead: readIds.has('dp-pending-all'),
      });
    }

    // Sort: overdue first, then due soon, then down payments
    const priority: Record<string, number> = { overdue: 0, due_soon: 1, down_payment_pending: 2 };
    notifs.sort((a, b) => priority[a.type] - priority[b.type]);

    return notifs;
  }, [installments, sales, customers, readIds]);

  const unreadCount = useMemo(
    () => notifications.filter(n => !n.isRead).length,
    [notifications]
  );

  const markAllRead = () => {
    const allIds = new Set(notifications.map(n => n.id));
    setReadIds(allIds);
  };

  const handleClick = (notif: Notification) => {
    setReadIds(prev => new Set(prev).add(notif.id));
    navigate(notif.route);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifications"
        aria-expanded={isOpen}
        className="relative p-2 rounded-xl hover:bg-white/10 text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e8a020]"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
            style={{ background: '#dc2626' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

            {/* Dropdown */}
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-1rem))] max-h-[calc(100dvh-5rem)] bg-white rounded-xl shadow-2xl border border-slate-100 z-50 overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                <h3 className="font-bold text-sm text-slate-800">Notifications</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-[11px] text-primary hover:underline font-medium"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-sm">
                    <Bell size={24} className="mx-auto mb-2 opacity-40" />
                    <p>No notifications</p>
                  </div>
                ) : (
                  notifications.map(notif => (
                    <button
                      key={notif.id}
                      onClick={() => handleClick(notif)}
                      className={`w-full text-left p-3 border-b border-slate-50 hover:bg-slate-50 transition-colors flex items-start gap-3 ${
                        !notif.isRead ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <div
                        className="mt-0.5 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: notif.color + '15', color: notif.color }}
                      >
                        {notif.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800">{notif.title}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{notif.message}</p>
                      </div>
                      <ChevronRight size={12} className="text-slate-300 mt-1 flex-shrink-0" />
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;
