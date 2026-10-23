import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, CreditCard, Save, X, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import FormField from '../../components/ui/FormField';
import {
  addDocument, updateDocument, deleteDocument, getDocument,
} from '../../firebase/firestore';
import { useLiveCollection } from '../../data/liveStore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { addDays } from 'date-fns';
import { printContent, generateReportHTML } from '../../utils/printUtils';
import type { PaymentPlan, CompanySettings } from '../../types';

const NAVY  = [26, 60, 110]   as [number, number, number];
const GOLD  = [232, 160, 32]  as [number, number, number];
const WHITE = [255, 255, 255] as [number, number, number];

const defaultForm = {
  name: '', duration: '', durationUnit: 'years',
  installmentType: 'Monthly', downPaymentPercent: '',
  numberOfInstallments: '', notes: '',
};

// ── Generate schedule-only PDF (fits on one A4 page) ──────────────────────────
function generateSchedulePDF(
  plan: PaymentPlan,
  totalPrice: number,
  company: CompanySettings | null,
): void {
  const downAmt       = Math.round(totalPrice * (plan.downPaymentPercent / 100));
  const remaining     = totalPrice - downAmt;
  const instAmt       = plan.numberOfInstallments > 0 ? remaining / plan.numberOfInstallments : 0;
  const daysMap: Record<string, number> = { Monthly: 30, Quarterly: 90, 'Semi-Annual': 180, Annual: 365 };
  const interval      = daysMap[plan.installmentType] || 30;
  const startDate     = new Date();

  const rows: (string | number)[][] = [];

  for (let i = 1; i <= plan.numberOfInstallments; i++) {
    const dueDate = addDays(startDate, i * interval);
    rows.push([
      i,
      formatDate(dueDate),
      formatCurrency(instAmt),
      'Pending',
    ]);
  }

  const html = generateReportHTML(
    company || { name: 'Faisal Homes', address: '', phone: '' } as CompanySettings,
    'Installment Schedule',
    ['#', 'Due Date', 'Amount Due', 'Status'],
    rows,
    `Plan: ${plan.name} | Installments: ${plan.numberOfInstallments} | Type: ${plan.installmentType}<br/>` +
    `Total: ${formatCurrency(totalPrice)} | Down: ${formatCurrency(downAmt)} | Remaining: ${formatCurrency(remaining)}`
  );

  printContent(html, 'Installment Schedule');
}

// ── Component ─────────────────────────────────────────────────────────────────
const PaymentPlans: React.FC = () => {
  const { data: plans } = useLiveCollection<PaymentPlan>('paymentPlans');
  const [company,  setCompany]  = useState<CompanySettings | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<PaymentPlan | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form,     setForm]     = useState(defaultForm);
  const [loading,  setLoading]  = useState(false);

  // For PDF preview price input
  const [pdfPlan,      setPdfPlan]      = useState<PaymentPlan | null>(null);
  const [pdfPrice,     setPdfPrice]     = useState('');
  const [showPdfModal, setShowPdfModal] = useState(false);

  useEffect(() => {
    let active = true;
    getDocument<CompanySettings>('settings', 'company').then(c => {
      if (active && c) setCompany(c);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const openAdd = () => {
    setEditItem(null);
    setForm(defaultForm);
    setShowModal(true);
  };

  const openEdit = (p: PaymentPlan) => {
    setEditItem(p);
    setForm({
      name: p.name, duration: String(p.duration), durationUnit: p.durationUnit,
      installmentType: p.installmentType, downPaymentPercent: String(p.downPaymentPercent),
      numberOfInstallments: String(p.numberOfInstallments), notes: p.notes,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.numberOfInstallments) {
      toast.error('Name and installment count required');
      return;
    }
    try {
      setLoading(true);
      const data = {
        name:                 form.name.trim(),
        duration:             Number(form.duration),
        durationUnit:         form.durationUnit as 'months' | 'years',
        installmentType:      form.installmentType as PaymentPlan['installmentType'],
        downPaymentPercent:   Number(form.downPaymentPercent),
        numberOfInstallments: Number(form.numberOfInstallments),
        notes:                form.notes,
      };
      if (editItem) {
        await updateDocument('paymentPlans', editItem.id, data);
        toast.success('Plan updated');
      } else {
        await addDocument('paymentPlans', data);
        toast.success('Payment plan created');
      }
      setShowModal(false);
    } catch {
      toast.error('Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteDocument('paymentPlans', deleteId);
      toast.success('Plan deleted');
    } catch {
      toast.error('Failed to delete');
    } finally {
      setDeleteId(null);
    }
  };

  const handlePrintSchedule = (plan: PaymentPlan) => {
    setPdfPlan(plan);
    setPdfPrice('');
    setShowPdfModal(true);
  };

  const set = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <PageHeader
        title="Payment Plans"
        subtitle="Manage installment payment plans"
        icon={<CreditCard size={20} />}
        actions={
          <button onClick={openAdd} className="btn btn-primary">
            <Plus size={16} /> Create Plan
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map(plan => (
          <div key={plan.id} className="card border-l-4" style={{ borderLeftColor: '#1a3c6e' }}>
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-bold text-slate-800 text-sm">{plan.name}</h3>
              <div className="flex gap-1">
                <button
                  onClick={() => handlePrintSchedule(plan)}
                  className="btn-icon hover:bg-blue-50 text-blue-400"
                  title="Download schedule PDF"
                >
                  <Printer size={14} />
                </button>
                <button onClick={() => openEdit(plan)} className="btn-icon hover:bg-amber-50 text-amber-500">
                  <Pencil size={14} />
                </button>
                <button onClick={() => setDeleteId(plan.id)} className="btn-icon hover:bg-red-50 text-red-400">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="space-y-1.5 text-xs">
              {[
                ['Duration',      `${plan.duration} ${plan.durationUnit}`],
                ['Type',          plan.installmentType],
                ['Down Payment',  `${plan.downPaymentPercent}%`],
                ['Installments',  plan.numberOfInstallments],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between">
                  <span className="text-slate-400">{k as string}</span>
                  <span className="font-semibold text-primary">{v as string | number}</span>
                </div>
              ))}
            </div>
            {plan.notes && (
              <p className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">{plan.notes}</p>
            )}
          </div>
        ))}

        {plans.length === 0 && (
          <div className="col-span-full card text-center py-12 text-slate-400">
            No payment plans yet. Create one!
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editItem ? 'Edit Plan' : 'Create Payment Plan'}
      >
        <div className="space-y-4">
          <FormField label="Plan Name" required>
            <input
              className="input-field"
              value={form.name}
              onChange={set('name')}
              placeholder='e.g., "3 Year Easy Installments"'
            />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Duration">
              <input className="input-field" type="number" value={form.duration} onChange={set('duration')} min="1" />
            </FormField>
            <FormField label="Unit">
              <select className="input-field" value={form.durationUnit} onChange={set('durationUnit')}>
                <option value="months">Months</option>
                <option value="years">Years</option>
              </select>
            </FormField>
            <FormField label="Installment Type">
              <select className="input-field" value={form.installmentType} onChange={set('installmentType')}>
                {['Monthly', 'Quarterly', 'Semi-Annual', 'Annual'].map(t => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Down Payment %" hint="e.g., 20">
              <input className="input-field" type="number" value={form.downPaymentPercent} onChange={set('downPaymentPercent')} min="0" max="100" />
            </FormField>
            <FormField label="No. of Installments" required>
              <input className="input-field" type="number" value={form.numberOfInstallments} onChange={set('numberOfInstallments')} min="1" />
            </FormField>
          </div>
          <FormField label="Notes">
            <textarea className="input-field h-16 resize-none" value={form.notes} onChange={set('notes')} />
          </FormField>
          <div className="flex gap-3">
            <button onClick={handleSave} disabled={loading} className="btn btn-primary flex-1 justify-center">
              <Save size={15} /> {loading ? 'Saving...' : 'Save Plan'}
            </button>
            <button onClick={() => setShowModal(false)} className="btn btn-secondary flex-1 justify-center">
              <X size={15} /> Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* PDF Price Input Modal */}
      <Modal
        isOpen={showPdfModal}
        onClose={() => setShowPdfModal(false)}
        title={`Schedule PDF — ${pdfPlan?.name || ''}`}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Enter the total plot price to generate the complete installment schedule.
          </p>
          <FormField label="Total Plot Price (Rs.)" required>
            <input
              className="input-field text-lg font-semibold"
              type="number"
              value={pdfPrice}
              onChange={e => setPdfPrice(e.target.value)}
              placeholder="e.g., 5000000"
              min="1"
              autoFocus
              style={{ color: '#1a3c6e' }}
            />
          </FormField>
          {pdfPlan && pdfPrice && Number(pdfPrice) > 0 && (
            <div className="p-3 rounded-xl text-xs space-y-1"
              style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af' }}>
              <div className="flex justify-between">
                <span>Total Price</span>
                <strong>{formatCurrency(Number(pdfPrice))}</strong>
              </div>
              <div className="flex justify-between">
                <span>Down Payment ({pdfPlan.downPaymentPercent}%)</span>
                <strong>{formatCurrency(Math.round(Number(pdfPrice) * pdfPlan.downPaymentPercent / 100))}</strong>
              </div>
              <div className="flex justify-between">
                <span>Monthly Installment (~)</span>
                <strong>{formatCurrency(Math.round((Number(pdfPrice) * (1 - pdfPlan.downPaymentPercent / 100)) / pdfPlan.numberOfInstallments))}</strong>
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => {
                if (!pdfPlan || !pdfPrice || Number(pdfPrice) <= 0) {
                  toast.error('Enter a valid price');
                  return;
                }
                generateSchedulePDF(pdfPlan, Number(pdfPrice), company);
                setShowPdfModal(false);
              }}
              className="btn btn-primary flex-1 justify-center"
            >
              <Printer size={15} /> Download PDF
            </button>
            <button onClick={() => setShowPdfModal(false)} className="btn btn-secondary flex-1 justify-center">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        message="Delete this payment plan? Existing sales using it will not be affected."
      />
    </div>
  );
};

export default PaymentPlans;
