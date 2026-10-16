import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { UserPlus, Save, X, Upload, Eye, Loader } from 'lucide-react';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';
import { storage } from '../../firebase/config';
import PageHeader from '../../components/ui/PageHeader';
import FormField from '../../components/ui/FormField';
import {
  addDocument, updateDocument, getDocument,
} from '../../firebase/firestore';
import {
  formatCNIC, validateCNIC, formatPhone,
} from '../../utils/formatters';
import { generateCustomerId } from '../../utils/customerIdGenerator';
import type { Customer, NomineeDetails, CustomerDocuments, NomineeRelation } from '../../types';

// ─── Section header ────────────────────────────────────────────────────────────
const Section: React.FC<{ title: string }> = ({ title }) => (
  <h3 className="form-section-header">{title}</h3>
);

// ─── Image upload field ────────────────────────────────────────────────────────
interface UploadFieldProps {
  label: string;
  fieldKey: string;
  existingUrl?: string;
  customerId: string;
  onUploaded: (url: string) => void;
}
const UploadField: React.FC<UploadFieldProps> = ({
  label, fieldKey, existingUrl, customerId, onUploaded,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview,   setPreview]   = useState(existingUrl || '');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !customerId) {
      toast.error('Save customer first, then upload documents');
      return;
    }
    try {
      setUploading(true);
      const ext  = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      if (!['jpg', 'jpeg', 'png', 'gif', 'pdf', 'webp'].includes(ext)) {
        toast.error('Only image or PDF files are allowed');
        setUploading(false);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File is too large (max 5 MB)');
        setUploading(false);
        return;
      }
      const path = `customers/${customerId}/${fieldKey}.${ext}`;
      const sRef = storageRef(storage, path);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      setPreview(url);
      onUploaded(url);
      toast.success(`${label} uploaded`);
    } catch (err) {
      console.error('Upload error:', err);
      const message =
        (err as { code?: string; message?: string } | undefined)?.message || 'Unknown error';
      // Surface the real cause (e.g. Firebase Storage permission error)
      if (message.includes('permission') || message.toLowerCase().includes('unauthorized')) {
        toast.error('Upload blocked. Check Firebase Storage security rules (no write access).');
      } else {
        toast.error(`Failed to upload ${label}: ${message}`);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="label">{label}</label>
      <div
        className="border-2 border-dashed rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:border-primary transition-colors"
        style={{ borderColor: preview ? '#1a3c6e' : '#e2e8f0', background: preview ? '#eff6ff' : '#fafafa' }}
        onClick={() => inputRef.current?.click()}
      >
        {preview ? (
          <>
            <img
              src={preview}
              alt={label}
              className="w-16 h-12 object-cover rounded-lg border border-slate-200 flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-primary truncate">Uploaded ✓</p>
              <p className="text-[11px] text-slate-400">Click to replace</p>
            </div>
            <a
              href={preview}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"
            >
              <Eye size={14} />
            </a>
          </>
        ) : (
          <>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: '#f1f5f9' }}>
              {uploading ? <Loader size={16} className="animate-spin text-primary" /> : <Upload size={16} className="text-slate-400" />}
            </div>
            <div>
              <p className="text-xs font-medium text-slate-600">{uploading ? 'Uploading...' : 'Click to upload'}</p>
              <p className="text-[11px] text-slate-400">JPG, PNG, PDF</p>
            </div>
          </>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFile} />
    </div>
  );
};

// ─── Main component ────────────────────────────────────────────────────────────
interface FormData {
  name: string; fatherName: string; cnic: string;
  phone: string; phone2: string; email: string; whatsapp: string;
  address: string; city: string; profession: string; monthlyIncome: string;
  emergencyContact: string; emergencyPhone: string; notes: string;
}

const defaultForm: FormData = {
  name: '', fatherName: '', cnic: '', phone: '', phone2: '',
  email: '', whatsapp: '', address: '', city: '',
  profession: '', monthlyIncome: '',
  emergencyContact: '', emergencyPhone: '', notes: '',
};

const defaultNominee: NomineeDetails = {
  nomineeName: '', nomineeRelation: '', nomineeCnic: '',
  nomineePhone: '', nomineeAddress: '',
};

const AddCustomer: React.FC = () => {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const isEdit    = !!id;

  const [form,      setForm]      = useState<FormData>(defaultForm);
  const [nominee,   setNominee]   = useState<NomineeDetails>(defaultNominee);
  const [docs,      setDocs]      = useState<CustomerDocuments>({});
  const [errors,    setErrors]    = useState<Partial<FormData>>({});
  const [loading,   setLoading]   = useState(false);
  const [savedId,   setSavedId]   = useState(id || '');   // real Firestore doc ID for uploads
  const [custIdStr, setCustIdStr] = useState('');          // display ID like CUST-2026-001

  useEffect(() => {
    if (isEdit && id) {
      getDocument<Customer>('customers', id).then(c => {
        if (!c) return;
        setForm({
          name: c.name, fatherName: c.fatherName, cnic: c.cnic,
          phone: c.phone, phone2: c.phone2 || '', email: c.email || '',
          whatsapp: c.whatsapp || '', address: c.address, city: c.city,
          profession: c.profession || '',
          monthlyIncome: c.monthlyIncome ? String(c.monthlyIncome) : '',
          emergencyContact: c.emergencyContact || '',
          emergencyPhone: c.emergencyPhone || '',
          notes: c.notes || '',
        });
        if (c.nominee)   setNominee(c.nominee);
        if (c.documents) setDocs(c.documents);
        setCustIdStr(c.customerId || '');
        setSavedId(id);
      });
    }
  }, [id, isEdit]);

  const validate = () => {
    const e: Partial<FormData> = {};
    if (!form.name.trim())      e.name      = 'Full name is required';
    if (!form.fatherName.trim()) e.fatherName = "Father's name is required";
    if (!form.cnic.trim())      e.cnic      = 'CNIC is required';
    else if (!validateCNIC(form.cnic)) e.cnic = 'Format: 35202-1234567-1';
    if (!form.phone.trim())     e.phone     = 'Phone is required';
    if (!form.address.trim())   e.address   = 'Address is required';
    if (!form.city.trim())      e.city      = 'City is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      setLoading(true);
      const data = {
        name:            form.name.trim(),
        fatherName:      form.fatherName.trim(),
        cnic:            form.cnic,
        phone:           form.phone,
        phone2:          form.phone2,
        email:           form.email.trim(),
        whatsapp:        form.whatsapp,
        address:         form.address.trim(),
        city:            form.city.trim(),
        profession:      form.profession.trim(),
        monthlyIncome:   form.monthlyIncome ? Number(form.monthlyIncome) : 0,
        emergencyContact: form.emergencyContact.trim(),
        emergencyPhone:  form.emergencyPhone,
        nominee,
        documents:       docs,
        notes:           form.notes.trim(),
      };

      if (isEdit) {
        await updateDocument('customers', id!, data);
        toast.success('Customer updated!');
        navigate('/customers/list');
      } else {
        // Generate customer ID
        const newCustId = await generateCustomerId();
        const docId = await addDocument('customers', { ...data, customerId: newCustId });
        setSavedId(docId);
        setCustIdStr(newCustId);
        toast.success(`Customer added! ID: ${newCustId}`);
        // Stay on page so user can upload documents
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to save customer');
    } finally {
      setLoading(false);
    }
  };

  const setF = (k: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      let val = e.target.value;
      if (k === 'cnic')         val = formatCNIC(val).slice(0, 15);
      if (['phone','phone2','whatsapp','emergencyPhone'].includes(k))
        val = formatPhone(val).slice(0, 12);
      setForm(f => ({ ...f, [k]: val }));
    };

  const setN = (k: keyof NomineeDetails) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      let val = e.target.value;
      if (k === 'nomineeCnic')  val = formatCNIC(val).slice(0, 15);
      if (k === 'nomineePhone') val = formatPhone(val).slice(0, 12);
      setNominee(n => ({ ...n, [k]: val }));
    };

  const updateDoc = (key: keyof CustomerDocuments, url: string) => {
    setDocs(prev => {
      const next = { ...prev, [key]: url };
      // Persist the full merged documents object to Firestore
      if (savedId) {
        updateDocument('customers', savedId, { documents: next }).catch((err) => {
          console.error('Failed to save documents to Firestore', err);
        });
      }
      return next;
    });
  };

  const NOMINEE_RELATIONS: NomineeRelation[] = [
    'Wife','Husband','Son','Daughter','Brother','Sister','Father','Mother','Other',
  ];

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Edit Customer' : 'Add Customer'}
        subtitle={custIdStr ? `Customer ID: ${custIdStr}` : 'Enter customer information'}
        icon={<UserPlus size={20} />}
      />

      {/* Customer ID badge after save */}
      {custIdStr && !isEdit && (
        <div className="mb-4 p-3 rounded-xl flex items-center gap-3"
          style={{ background: '#dcfce7', border: '1px solid #86efac' }}>
          <span className="text-2xl">🆔</span>
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

          {/* ── Personal ── */}
          <Section title="Personal Information" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Full Name" required error={errors.name}>
              <input className={`input-field ${errors.name ? 'input-error' : ''}`}
                value={form.name} onChange={setF('name')} placeholder="Muhammad Ahmed Khan" />
            </FormField>
            <FormField label="Father Name" required error={errors.fatherName}>
              <input className={`input-field ${errors.fatherName ? 'input-error' : ''}`}
                value={form.fatherName} onChange={setF('fatherName')} placeholder="Father's full name" />
            </FormField>
            <FormField label="CNIC" required error={errors.cnic} hint="Format: 35202-1234567-1">
              <input className={`input-field font-mono ${errors.cnic ? 'input-error' : ''}`}
                value={form.cnic} onChange={setF('cnic')} placeholder="35202-1234567-1" />
            </FormField>
            <FormField label="Profession">
              <input className="input-field" value={form.profession} onChange={setF('profession')} placeholder="e.g., Business" />
            </FormField>
            <FormField label="Monthly Income (Rs.)">
              <input className="input-field" type="number" value={form.monthlyIncome}
                onChange={e => setForm(f => ({ ...f, monthlyIncome: e.target.value }))} placeholder="e.g., 100000" />
            </FormField>
          </div>

          {/* ── Contact ── */}
          <Section title="Contact Information" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Phone (Primary)" required error={errors.phone} hint="03XX-XXXXXXX">
              <input className={`input-field ${errors.phone ? 'input-error' : ''}`}
                value={form.phone} onChange={setF('phone')} placeholder="0300-1234567" />
            </FormField>
            <FormField label="Phone 2 (Optional)">
              <input className="input-field" value={form.phone2} onChange={setF('phone2')} placeholder="0311-1234567" />
            </FormField>
            <FormField label="WhatsApp">
              <input className="input-field" value={form.whatsapp} onChange={setF('whatsapp')} placeholder="03XX-XXXXXXX" />
            </FormField>
            <FormField label="Email">
              <input className="input-field" type="email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
            </FormField>
          </div>

          {/* ── Address ── */}
          <Section title="Address" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Address" required error={errors.address}>
              <input className={`input-field ${errors.address ? 'input-error' : ''}`}
                value={form.address} onChange={setF('address')} placeholder="House #, Street, Area" />
            </FormField>
            <FormField label="City" required error={errors.city}>
              <input className={`input-field ${errors.city ? 'input-error' : ''}`}
                value={form.city} onChange={setF('city')} placeholder="e.g., Lahore" />
            </FormField>
          </div>

          {/* ── Emergency ── */}
          <Section title="Emergency Contact" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Emergency Contact Name">
              <input className="input-field" value={form.emergencyContact}
                onChange={setF('emergencyContact')} placeholder="Contact person name" />
            </FormField>
            <FormField label="Emergency Phone">
              <input className="input-field" value={form.emergencyPhone}
                onChange={setF('emergencyPhone')} placeholder="03XX-XXXXXXX" />
            </FormField>
          </div>

          {/* ── Nominee Details ── */}
          <Section title="Nominee Details" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Nominee Full Name" required={false}>
              <input className="input-field" value={nominee.nomineeName}
                onChange={setN('nomineeName')} placeholder="Nominee full name" />
            </FormField>
            <FormField label="Relation" required={false}>
              <select className="input-field" value={nominee.nomineeRelation} onChange={setN('nomineeRelation')}>
                <option value="">Select relation...</option>
                {NOMINEE_RELATIONS.map(r => <option key={r}>{r}</option>)}
              </select>
            </FormField>
            <FormField label="Nominee CNIC" hint="Format: 35202-1234567-1">
              <input className="input-field font-mono" value={nominee.nomineeCnic}
                onChange={setN('nomineeCnic')} placeholder="35202-1234567-1" />
            </FormField>
            <FormField label="Nominee Phone">
              <input className="input-field" value={nominee.nomineePhone}
                onChange={setN('nomineePhone')} placeholder="03XX-XXXXXXX" />
            </FormField>
            <FormField label="Nominee Address">
              <input className="input-field" value={nominee.nomineeAddress}
                onChange={setN('nomineeAddress')} placeholder="Nominee's address" />
            </FormField>
          </div>

          <FormField label="Notes">
            <textarea className="input-field h-20 resize-none" value={form.notes}
              onChange={setF('notes')} placeholder="Additional notes..." />
          </FormField>

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

      {/* ── Document Uploads (shown after customer is saved) ── */}
      {savedId && (
        <div className="card max-w-3xl mt-5">
          <Section title="Documents & CNIC Images" />
          <p className="text-xs text-slate-400 mb-4 -mt-2">
            Upload CNIC images and other documents. They are stored securely in Firebase Storage.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <UploadField
              label="Customer CNIC Front"
              fieldKey="cnic-front"
              existingUrl={docs.cnicFront}
              customerId={savedId}
              onUploaded={url => updateDoc('cnicFront', url)}
            />
            <UploadField
              label="Customer CNIC Back"
              fieldKey="cnic-back"
              existingUrl={docs.cnicBack}
              customerId={savedId}
              onUploaded={url => updateDoc('cnicBack', url)}
            />
            <UploadField
              label="Customer Photo"
              fieldKey="photo"
              existingUrl={docs.customerPhoto}
              customerId={savedId}
              onUploaded={url => updateDoc('customerPhoto', url)}
            />
            <UploadField
              label="Nominee CNIC Front"
              fieldKey="nominee-cnic-front"
              existingUrl={docs.nomineeCnicFront}
              customerId={savedId}
              onUploaded={url => updateDoc('nomineeCnicFront', url)}
            />
            <UploadField
              label="Nominee CNIC Back"
              fieldKey="nominee-cnic-back"
              existingUrl={docs.nomineeCnicBack}
              customerId={savedId}
              onUploaded={url => updateDoc('nomineeCnicBack', url)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AddCustomer;
