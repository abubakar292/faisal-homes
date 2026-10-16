import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Handshake, Save, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import FormField from '../../components/ui/FormField';
import { addDocument, updateDocument, getDocument } from '../../firebase/firestore';
import { formatCNIC, validateCNIC, formatPhone } from '../../utils/formatters';
import type { Dealer } from '../../types';

const AddDealer: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const [form, setForm] = useState({
    name: '', cnic: '', phone: '', whatsapp: '', email: '',
    address: '', notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEdit) {
      getDocument<Dealer>('dealers', id!).then(d => {
        if (d) setForm({ name: d.name, cnic: d.cnic, phone: d.phone, whatsapp: d.whatsapp || '', email: d.email || '', address: d.address || '', notes: d.notes || '' });
      });
    }
  }, [id, isEdit]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name required';
    if (!form.cnic.trim() || !validateCNIC(form.cnic)) e.cnic = 'Valid CNIC required (XXXXX-XXXXXXX-X)';
    if (!form.phone.trim()) e.phone = 'Phone required';
    
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      setLoading(true);
      const data = { name: form.name.trim(), cnic: form.cnic, phone: form.phone, whatsapp: form.whatsapp, email: form.email.trim(), address: form.address.trim(), notes: form.notes.trim() };
      if (isEdit) { await updateDocument('dealers', id!, data); toast.success('Dealer updated!'); }
      else { await addDocument('dealers', data); toast.success('Dealer added!'); }
      navigate('/dealers/list');
    } catch { toast.error('Failed to save dealer'); } finally { setLoading(false); }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    let val = e.target.value;
    if (k === 'cnic') val = formatCNIC(val).slice(0, 15);
    if (k === 'phone' || k === 'whatsapp') val = formatPhone(val).slice(0, 12);
    setForm(f => ({ ...f, [k]: val }));
  };

  return (
    <div>
      <PageHeader title={isEdit ? 'Edit Dealer' : 'Add Dealer'} subtitle="Dealer information" icon={<Handshake size={20} />} />
      <div className="card max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Full Name" required error={errors.name}>
              <input className={`input-field ${errors.name ? 'input-error' : ''}`} value={form.name} onChange={set('name')} />
            </FormField>
            <FormField label="CNIC" required error={errors.cnic} hint="XXXXX-XXXXXXX-X">
              <input className={`input-field font-mono ${errors.cnic ? 'input-error' : ''}`} value={form.cnic} onChange={set('cnic')} placeholder="35202-1234567-1" />
            </FormField>
            <FormField label="Phone" required error={errors.phone}>
              <input className={`input-field ${errors.phone ? 'input-error' : ''}`} value={form.phone} onChange={set('phone')} placeholder="03XX-XXXXXXX" />
            </FormField>
            <FormField label="WhatsApp">
              <input className="input-field" value={form.whatsapp} onChange={set('whatsapp')} placeholder="03XX-XXXXXXX" />
            </FormField>
            <FormField label="Email">
              <input className="input-field" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </FormField>
            
            
          </div>
          <FormField label="Address">
            <input className="input-field" value={form.address} onChange={set('address')} />
          </FormField>
          <FormField label="Notes">
            <textarea className="input-field h-16 resize-none" value={form.notes} onChange={set('notes')} />
          </FormField>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-primary disabled:opacity-60"><Save size={16} /> {loading ? 'Saving...' : (isEdit ? 'Update' : 'Add Dealer')}</button>
            <button type="button" onClick={() => navigate('/dealers/list')} className="btn-secondary"><X size={16} /> Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddDealer;
