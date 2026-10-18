import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Users, Eye, BookOpen } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';
import { getDocument, getCollection } from '../../firebase/firestore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import type { Customer, Sale, Plot, Installment } from '../../types';
import { BrandLoader } from '../../components/brand';

const CustomerDetail: React.FC = () => {
  const { id }   = useParams();
  const navigate = useNavigate();
  const [customer,     setCustomer]     = useState<Customer | null>(null);
  const [sales,        setSales]        = useState<Sale[]>([]);
  const [plots,        setPlots]        = useState<Plot[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);

  useEffect(() => {
    if (!id) return;
    getDocument<Customer>('customers', id).then(setCustomer);
    getCollection<Sale>('sales').then(async allSales => {
      const mine = allSales.filter(s => s.customerId === id);
      setSales(mine);
      const allPlots = await getCollection<Plot>('plots');
      setPlots(allPlots.filter(p => mine.some(s => s.plotId === p.id)));
      const allInst  = await getCollection<Installment>('installments');
      setInstallments(allInst.filter(i => i.customerId === id));
    });
  }, [id]);

  if (!customer) {
    return <BrandLoader />;
  }

  const paidAmount    = installments.filter(i => i.status === 'paid').reduce((s, i) => s + i.amountPaid, 0);
  const pendingAmount = installments.filter(i => i.status !== 'paid').reduce((s, i) => s + i.amountDue, 0);
  const plotById      = (pid: string) => plots.find(p => p.id === pid);

  const docEntries = [
    { key: 'cnicFront',      label: 'CNIC Front',       url: customer.documents?.cnicFront },
    { key: 'cnicBack',       label: 'CNIC Back',        url: customer.documents?.cnicBack },
    { key: 'customerPhoto',  label: 'Customer Photo',   url: customer.documents?.customerPhoto },
    { key: 'nomineeCnicFront', label: 'Nominee CNIC Front', url: customer.documents?.nomineeCnicFront },
    { key: 'nomineeCnicBack',  label: 'Nominee CNIC Back',  url: customer.documents?.nomineeCnicBack },
  ].filter(d => !!d.url);

  return (
    <div>
      <PageHeader
        title={customer.name}
        subtitle={customer.customerId ? `ID: ${customer.customerId} · ${customer.cnic}` : customer.cnic}
        icon={<Users size={20} />}
        actions={
          <div className="flex flex-wrap gap-2">
            <button onClick={() => navigate(-1)} className="btn btn-secondary btn-sm">
              <ArrowLeft size={15} /> Back
            </button>
            <button onClick={() => navigate(`/reports/pending/customer/${id}`)} className="btn btn-secondary bg-white btn-sm text-primary">
              <BookOpen size={15} /> View Ledger
            </button>
            <button onClick={() => navigate(`/customers/edit/${id}`)} className="btn btn-primary btn-sm">
              <Pencil size={15} /> Edit
            </button>
          </div>
        }
      />

      {/* Customer ID badge */}
      {customer.customerId && (
        <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl"
          style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
          <span className="text-xs font-bold text-blue-700">🆔 {customer.customerId}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Personal info */}
        <div className="card">
          <h3 className="font-bold text-primary text-sm mb-4">Personal Information</h3>
          <dl className="space-y-2.5">
            {[
              ['Full Name',        customer.name],
              ['Father Name',      customer.fatherName],
              ['CNIC',             customer.cnic],
              ['Phone',            customer.phone],
              ['Phone 2',          customer.phone2 || '—'],
              ['WhatsApp',         customer.whatsapp || '—'],
              ['Email',            customer.email || '—'],
              ['Address',          customer.address],
              ['City',             customer.city],
              ['Profession',       customer.profession || '—'],
              ['Monthly Income',   customer.monthlyIncome ? formatCurrency(customer.monthlyIncome) : '—'],
              ['Emergency Contact',customer.emergencyContact || '—'],
              ['Emergency Phone',  customer.emergencyPhone || '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-xs text-slate-400 flex-shrink-0">{k}</dt>
                <dd className="text-sm font-medium text-slate-800 text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="space-y-4">
          {/* Financial summary */}
          <div className="card">
            <h3 className="font-bold text-primary text-sm mb-3">Financial Summary</h3>
            <div className="space-y-2">
              {[
                ['Total Plots',  sales.length,              '#1a3c6e'],
                ['Total Paid',   formatCurrency(paidAmount), '#15803d'],
                ['Pending',      formatCurrency(pendingAmount), '#b91c1c'],
              ].map(([k, v, color]) => (
                <div key={k as string} className="flex justify-between">
                  <span className="text-sm text-slate-500">{k as string}</span>
                  <span className="font-bold" style={{ color: color as string }}>{v as string | number}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Nominee details */}
          {customer.nominee?.nomineeName && (
            <div className="card">
              <h3 className="font-bold text-primary text-sm mb-3">Nominee Details</h3>
              <dl className="space-y-2">
                {[
                  ['Name',     customer.nominee.nomineeName],
                  ['Relation', customer.nominee.nomineeRelation],
                  ['CNIC',     customer.nominee.nomineeCnic],
                  ['Phone',    customer.nominee.nomineePhone],
                  ['Address',  customer.nominee.nomineeAddress],
                ].filter(([, v]) => !!v).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="text-xs text-slate-400 flex-shrink-0">{k}</dt>
                    <dd className="text-sm font-medium text-slate-800 text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {customer.notes && (
            <div className="card">
              <h3 className="font-bold text-primary text-sm mb-2">Notes</h3>
              <p className="text-sm text-slate-500">{customer.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Documents */}
      {docEntries.length > 0 && (
        <div className="card mt-5">
          <h3 className="font-bold text-primary text-sm mb-4">Documents & Images</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {docEntries.map(({ key, label, url }) => (
              <div key={key} className="space-y-1">
                <a href={url} target="_blank" rel="noopener noreferrer" className="block group">
                  <div className="relative overflow-hidden rounded-xl border border-slate-200 aspect-[4/3]">
                    <img
                      src={url}
                      alt={label}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'rgba(0,0,0,0.4)' }}>
                      <Eye size={20} className="text-white" />
                    </div>
                  </div>
                </a>
                <p className="text-[11px] text-center text-slate-500 font-medium">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plots */}
      {sales.length > 0 && (
        <div className="card mt-5">
          <h3 className="font-bold text-primary text-sm mb-4">Plots & Sales</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                {['Plot','Block','Size','Final Price','Down Payment','Remaining','Status'].map(h =>
                  <th key={h} className="table-th">{h}</th>)}
              </tr></thead>
              <tbody>
                {sales.map(sale => {
                  const plot = plotById(sale.plotId);
                  return (
                    <tr key={sale.id} className="table-row">
                      <td className="table-td font-mono font-bold">{plot?.plotNumber || '—'}</td>
                      <td className="table-td">{plot?.block || '—'}</td>
                      <td className="table-td">{plot ? `${plot.size} ${plot.sizeUnit}` : '—'}</td>
                      <td className="table-td font-semibold">{formatCurrency(sale.finalPrice)}</td>
                      <td className="table-td">{formatCurrency(sale.downPayment)}</td>
                      <td className="table-td font-bold" style={{ color: '#b91c1c' }}>{formatCurrency(sale.remainingAmount)}</td>
                      <td className="table-td"><StatusBadge status={sale.status} size="sm" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Installments */}
      {installments.length > 0 && (
        <div className="card mt-5">
          <h3 className="font-bold text-primary text-sm mb-4">
            Payment History ({installments.length} installments)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                {['#','Due Date','Amount Due','Paid','Payment Date','Method','Status'].map(h =>
                  <th key={h} className="table-th">{h}</th>)}
              </tr></thead>
              <tbody>
                {[...installments].sort((a,b) => a.installmentNumber - b.installmentNumber).map(inst => (
                  <tr key={inst.id} className="table-row">
                    <td className="table-td">#{inst.installmentNumber}</td>
                    <td className="table-td">{formatDate(inst.dueDate)}</td>
                    <td className="table-td">{formatCurrency(inst.amountDue)}</td>
                    <td className="table-td font-semibold" style={{ color: '#15803d' }}>{formatCurrency(inst.amountPaid)}</td>
                    <td className="table-td">{formatDate(inst.paymentDate)}</td>
                    <td className="table-td">{inst.paymentMethod || '—'}</td>
                    <td className="table-td"><StatusBadge status={inst.status} size="sm" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerDetail;
