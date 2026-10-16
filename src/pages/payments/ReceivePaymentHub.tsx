import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Receipt, CreditCard, BookMarked } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import ReceivePayment from './ReceivePayment';
import ReceiveDownPayment from './ReceiveDownPayment';

export default function ReceivePaymentHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawType = searchParams.get('type');
  const activeType: 'installment' | 'down' | 'possession' =
    rawType === 'down' ? 'down' : rawType === 'possession' ? 'possession' : 'installment';

  const handleTabChange = (type: 'installment' | 'down' | 'possession') => {
    const next = new URLSearchParams(searchParams);
    if (type === 'installment') {
      next.delete('type');
    } else {
      next.set('type', type);
    }
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Receive Payment"
        subtitle="Record installments, down payments, and possession payments"
        icon={<Receipt size={20} />}
      />

      {/* Segmented control */}
      <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200 gap-1 text-xs font-semibold shadow-inner">
        <button
          onClick={() => handleTabChange('installment')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all ${
            activeType === 'installment'
              ? 'bg-white text-slate-900 shadow-sm font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          id="tab-payment-installment"
        >
          <Receipt size={14} className={activeType === 'installment' ? 'text-primary' : 'text-slate-400'} />
          Installment
        </button>

        <button
          onClick={() => handleTabChange('down')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all ${
            activeType === 'down'
              ? 'bg-white text-slate-900 shadow-sm font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          id="tab-payment-down"
        >
          <CreditCard size={14} className={activeType === 'down' ? 'text-primary' : 'text-slate-400'} />
          Down Payment
        </button>

        <button
          onClick={() => handleTabChange('possession')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all ${
            activeType === 'possession'
              ? 'bg-white text-slate-900 shadow-sm font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          id="tab-payment-possession"
        >
          <BookMarked size={14} className={activeType === 'possession' ? 'text-primary' : 'text-slate-400'} />
          On Possession
        </button>
      </div>

      {/* Render selected view */}
      <div>
        {activeType === 'down' && <ReceiveDownPayment embedded />}
        {activeType === 'possession' && <ReceivePayment possessionMode embedded />}
        {activeType === 'installment' && <ReceivePayment embedded />}
      </div>
    </div>
  );
}
