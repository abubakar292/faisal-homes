import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Handshake, Save, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { addDocument, updateDocument, getDocument } from '../../firebase/firestore';
import type { Dealer } from '../../types';
import {
  DealerFormData,
  defaultDealerFormData,
  validateDealer,
  buildDealerPayload,
} from '../../utils/dealerForm';
import DealerFormFields from '../../components/forms/DealerFormFields';

const AddDealer: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const [form, setForm] = useState<DealerFormData>(defaultDealerFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEdit) {
      getDocument<Dealer>('dealers', id!).then(d => {
        if (d) {
          setForm({
            name: d.name || '',
            cnic: d.cnic || '',
            phone: d.phone || '',
            whatsapp: d.whatsapp || '',
            email: d.email || '',
            address: d.address || '',
            notes: d.notes || '',
            commissionType: d.commissionType || 'percentage',
            commissionRate: d.commissionRate || 0,
          });
        }
      });
    }
  }, [id, isEdit]);

  const validate = () => {
    const errs = validateDealer(form);
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      setLoading(true);
      const data = buildDealerPayload(form);
      if (isEdit) {
        await updateDocument('dealers', id!, data);
        toast.success('Dealer updated!');
      } else {
        await addDocument('dealers', data);
        toast.success('Dealer added!');
      }
      navigate('/dealers/list');
    } catch {
      toast.error('Failed to save dealer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Edit Dealer' : 'Add Dealer'}
        subtitle="Dealer information"
        icon={<Handshake size={20} />}
      />
      <div className="card max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DealerFormFields
            form={form}
            onChange={(key, val) => setForm(f => ({ ...f, [key]: val }))}
            errors={errors}
          />
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-primary disabled:opacity-60">
              <Save size={16} /> {loading ? 'Saving...' : (isEdit ? 'Update' : 'Add Dealer')}
            </button>
            <button type="button" onClick={() => navigate('/dealers/list')} className="btn-secondary">
              <X size={16} /> Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddDealer;
