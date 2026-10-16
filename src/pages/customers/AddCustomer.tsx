import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { UserPlus, Save, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import {
  addDocument,
  updateDocument,
  getDocument,
} from '../../firebase/firestore';
import { generateCustomerId } from '../../utils/customerIdGenerator';
import type { Customer, NomineeDetails, CustomerDocuments } from '../../types';
import {
  CustomerFormData,
  defaultCustomerFormData,
  defaultNomineeDetails,
  validateCustomer,
  buildCustomerPayload,
} from '../../utils/customerForm';
import CustomerFormFields from '../../components/forms/CustomerFormFields';
import NomineeFields from '../../components/forms/NomineeFields';
import DocumentUploads from '../../components/forms/DocumentUploads';

const AddCustomer: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [form, setForm] = useState<CustomerFormData>(defaultCustomerFormData);
  const [nominee, setNominee] = useState<NomineeDetails>(defaultNomineeDetails);
  const [docs, setDocs] = useState<CustomerDocuments>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [savedId, setSavedId] = useState(id || '');
  const [custIdStr, setCustIdStr] = useState('');

  useEffect(() => {
    if (isEdit && id) {
      getDocument<Customer>('customers', id).then(c => {
        if (!c) return;
        setForm({
          name: c.name || '',
          fatherName: c.fatherName || '',
          cnic: c.cnic || '',
          phone: c.phone || '',
          phone2: c.phone2 || '',
          email: c.email || '',
          whatsapp: c.whatsapp || '',
          address: c.address || '',
          city: c.city || '',
          profession: c.profession || '',
          monthlyIncome: c.monthlyIncome ? String(c.monthlyIncome) : '',
          emergencyContact: c.emergencyContact || '',
          emergencyPhone: c.emergencyPhone || '',
          notes: c.notes || '',
        });
        if (c.nominee) setNominee(c.nominee);
        if (c.documents) setDocs(c.documents);
        setCustIdStr(c.customerId || '');
        setSavedId(id);
      });
    }
  }, [id, isEdit]);

  const validate = () => {
    const errs = validateCustomer(form);
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      setLoading(true);
      const data = buildCustomerPayload(form, nominee, docs);

      if (isEdit) {
        await updateDocument('customers', id!, data);
        toast.success('Customer updated!');
        navigate('/customers/list');
      } else {
        const newCustId = await generateCustomerId();
        const docId = await addDocument('customers', { ...data, customerId: newCustId });
        setSavedId(docId);
        setCustIdStr(newCustId);
        toast.success(`Customer added! ID: ${newCustId}`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to save customer');
    } finally {
      setLoading(false);
    }
  };

  const updateDoc = (key: keyof CustomerDocuments, url: string) => {
    setDocs(prev => {
      const next = { ...prev, [key]: url };
      if (savedId) {
        updateDocument('customers', savedId, { documents: next }).catch(err => {
          console.error('Failed to save documents to Firestore', err);
        });
      }
      return next;
    });
  };

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Edit Customer' : 'Add Customer'}
        subtitle={custIdStr ? `Customer ID: ${custIdStr}` : 'Enter customer information'}
        icon={<UserPlus size={20} />}
      />

      {/* Customer ID badge after save */}
      {custIdStr && !isEdit && (
        <div
          className="mb-4 p-3 rounded-xl flex items-center gap-3"
          style={{ background: '#dcfce7', border: '1px solid #86efac' }}
        >
          <span className="text-2xl font-mono text-emerald-800">ID</span>
          <div>
            <p className="text-sm font-bold text-green-800">Customer saved! ID: {custIdStr}</p>
            <p className="text-xs text-green-600">You can now upload documents below, or navigate away.</p>
          </div>
          <button onClick={() => navigate('/customers/list')} className="btn btn-secondary btn-sm ml-auto">
            View List
          </button>
        </div>
      )}

      <div className="card max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          <CustomerFormFields
            form={form}
            onChange={(key, val) => setForm(f => ({ ...f, [key]: val }))}
            errors={errors}
          />

          <NomineeFields
            nominee={nominee}
            onChange={(key, val) => setNominee(n => ({ ...n, [key]: val }))}
          />

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn btn-primary disabled:opacity-60">
              <Save size={16} /> {loading ? 'Saving...' : (isEdit ? 'Update Customer' : 'Save Customer')}
            </button>
            <button type="button" onClick={() => navigate('/customers/list')} className="btn btn-secondary">
              <X size={16} /> Cancel
            </button>
          </div>
        </form>
      </div>

      {/* Document Uploads (shown after customer is saved) */}
      {savedId && (
        <DocumentUploads
          customerId={savedId}
          documents={docs}
          onDocumentChange={updateDoc}
        />
      )}
    </div>
  );
};

export default AddCustomer;
