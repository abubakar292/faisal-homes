import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Home } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';
import { getDocument, getCollection } from '../../firebase/firestore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import type { Plot, Sale, Customer, Installment } from '../../types';
import { BrandLoader } from '../../components/brand';

const PlotDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [plot, setPlot] = useState<Plot | null>(null);
  const [sale, setSale] = useState<Sale | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);

  useEffect(() => {
    if (!id) return;
    getDocument<Plot>('plots', id).then(setPlot);
    getCollection<Sale>('sales').then(sales => {
      const s = sales.find(s => s.plotId === id);
      if (s) {
        setSale(s);
        getDocument<Customer>('customers', s.customerId).then(setCustomer);
        getCollection<Installment>('installments').then(insts => {
          setInstallments(insts.filter(i => i.saleId === s.id).sort((a, b) => a.installmentNumber - b.installmentNumber));
        });
      }
    });
  }, [id]);

  if (!plot) return <BrandLoader />;

  const paidAmount = installments.filter(i => i.status === 'paid').reduce((s, i) => s + i.amountPaid, 0);

  return (
    <div>
      <PageHeader
        title={`Plot ${plot.plotNumber}`}
        subtitle={`Block ${plot.block} · ${plot.size} ${plot.sizeUnit}`}
        icon={<Home size={20} />}
        actions={
          <div className="flex gap-2">
            <button onClick={() => navigate(-1)} className="btn-secondary"><ArrowLeft size={16} /> Back</button>
            <button onClick={() => navigate(`/plots/edit/${id}`)} className="btn-primary"><Pencil size={16} /> Edit</button>
          </div>
        }
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Plot info */}
        <div className="card">
          <h3 className="font-semibold text-slate-700 mb-4">Plot Information</h3>
          <dl className="space-y-3">
            {[
              ['Plot Number', plot.plotNumber],
              ['Block/Phase', plot.block],
              ['Size', `${plot.size} ${plot.sizeUnit}`],
              ['Category', plot.category],
              ['Location', plot.location || '—'],
              ['Description', plot.description || '—'],
              ['Added On', formatDate(plot.createdAt)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <dt className="text-sm text-slate-500">{label}</dt>
                <dd className="text-sm font-medium text-slate-800 text-right max-w-[60%]">{value}</dd>
              </div>
            ))}
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">Status</dt>
              <dd><StatusBadge status={plot.status} /></dd>
            </div>
          </dl>
        </div>

        {/* Owner info */}
        {customer && sale && (
          <div className="card">
            <h3 className="font-semibold text-slate-700 mb-4">Owner Information</h3>
            <dl className="space-y-3">
              {[
                ['Customer', customer.name],
                ['CNIC', customer.cnic],
                ['Phone', customer.phone],
                ['City', customer.city],
                ['Sale Date', formatDate(sale.saleDate)],
                ['Final Price', formatCurrency(sale.finalPrice)],
                ['Down Payment', formatCurrency(sale.downPayment)],
                ['Paid Amount', formatCurrency(paidAmount)],
                ['Remaining', formatCurrency(sale.remainingAmount)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <dt className="text-sm text-slate-500">{label}</dt>
                  <dd className="text-sm font-medium text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      {/* Installment schedule */}
      {installments.length > 0 && (
        <div className="card mt-5">
          <h3 className="font-semibold text-slate-700 mb-4">Installment Schedule</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  {['Type / #', 'Due Date', 'Amount Due', 'Amount Paid', 'Status'].map(h =>
                    <th key={h} className="table-th">{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {installments.map(inst => {
                  const isDownPayment = inst.type === 'down_payment';
                  const isSemiAnnual = inst.type === 'semi_annual';
                  const isPossession = inst.type === 'on_possession';
                  const label = isDownPayment ? '📌 Down Payment' : isSemiAnnual ? '⭐ Semi-Annual' : isPossession ? '🏠 Possession' : `#${inst.installmentNumber}`;
                  
                  return (
                    <tr key={inst.id} className="table-row" style={isDownPayment ? { backgroundColor: '#fffbeb', fontWeight: 'bold' } : {}}>
                      <td className="table-td">{label}</td>
                      <td className="table-td">{formatDate(inst.dueDate)}</td>
                      <td className="table-td">{formatCurrency(inst.amountDue)}</td>
                      <td className="table-td">{formatCurrency(inst.amountPaid)}</td>
                      <td className="table-td"><StatusBadge status={inst.status} size="sm" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlotDetail;
