import React, { useEffect, useState } from 'react';
import { Building2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import FormField from '../../components/ui/FormField';
import { getDocument, setDocument } from '../../firebase/firestore';
import type { CompanySettings } from '../../types';

const defaultSettings: CompanySettings = {
  name: 'Faisal Homes', address: '', phone: '', whatsapp: '',
  email: '', logo: '', website: '', tagline: 'Your Dream Home, Our Commitment', termsAndConditions: ''
};

const CompanyInfo: React.FC = () => {
  const [form, setForm] = useState<CompanySettings>(defaultSettings);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getDocument<CompanySettings>('settings', 'company').then(s => {
      if (s) setForm({ ...defaultSettings, ...s });
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Company name is required'); return; }
    try {
      setLoading(true);
      await setDocument('settings', 'company', form);
      toast.success('Company information saved!');
    } catch { toast.error('Failed to save'); } finally { setLoading(false); }
  };

  const set = (k: keyof CompanySettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <PageHeader title="Company Information" subtitle="Used in all PDF receipts and reports" icon={<Building2 size={20} />} />
      <div className="card max-w-2xl">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Company Name" required>
              <input className="input-field" value={form.name} onChange={set('name')} placeholder="Faisal Homes" />
            </FormField>
            <FormField label="Tagline">
              <input className="input-field" value={form.tagline} onChange={set('tagline')} placeholder="Your Dream Home..." />
            </FormField>
            <FormField label="Phone">
              <input className="input-field" value={form.phone} onChange={set('phone')} placeholder="0300-1234567" />
            </FormField>
            <FormField label="WhatsApp">
              <input className="input-field" value={form.whatsapp} onChange={set('whatsapp')} placeholder="0300-1234567" />
            </FormField>
            <FormField label="Email">
              <input className="input-field" type="email" value={form.email} onChange={set('email')} placeholder="info@faisalhomes.com" />
            </FormField>
            <FormField label="Website">
              <input className="input-field" value={form.website} onChange={set('website')} placeholder="www.faisalhomes.com" />
            </FormField>
          </div>
          <FormField label="Address">
            <textarea className="input-field h-20 resize-none" value={form.address} onChange={set('address')} placeholder="Office address..." />
          </FormField>
          
          <div className="pt-4 border-t border-slate-200">
            <FormField label="Terms & Conditions" hint="This text will appear in Plot Agreements and other documents.">
              <textarea
                className="input-field resize-y font-mono text-sm"
                rows={10}
                value={form.termsAndConditions || ''}
                onChange={(e) => setForm(f => ({ ...f, termsAndConditions: e.target.value }))}
                placeholder={"Enter your company's terms and conditions here...\n\n1. Payment must be made on or before the due date.\n2. ..."}
              />
            </FormField>
          </div>

          <button type="submit" disabled={loading} className="btn-primary disabled:opacity-60">
            <Save size={16} /> {loading ? 'Saving...' : 'Save Company Info'}
          </button>
        </form>

        {/* Preview */}
        <div className="mt-6 p-5 rounded-xl border-2 border-dashed border-primary/20 bg-primary/5">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">PDF Header Preview</p>
          <div className="p-4 rounded-lg text-white text-sm" style={{ background: 'linear-gradient(135deg, #0f2548, #1a3c6e)' }}>
            <p className="font-bold text-base">{form.name || 'Company Name'}</p>
            <p className="text-white/60 text-xs mt-0.5">{form.tagline || 'Tagline'}</p>
            <div className="flex justify-between mt-2 text-xs text-white/70">
              <span>{form.address || 'Address'}</span>
              <span>{form.phone || 'Phone'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyInfo;
