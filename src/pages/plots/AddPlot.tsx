import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Home, Save, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import FormField from '../../components/ui/FormField';
import { addDocument, updateDocument, getDocument } from '../../firebase/firestore';
import { useLiveCollection } from '../../data/liveStore';
import type { Plot, PlotCategoryDoc } from '../../types';

interface FormData {
  plotNumber: string;
  block: string;
  size: string;
  sizeUnit: string;
  category: string;
  status: string;
  location: string;
  description: string;
}

const defaultForm: FormData = {
  plotNumber: '',
  block: '',
  size: '',
  sizeUnit: 'Marla',
  category: 'Residential',
  status: 'available',
  location: '',
  description: '',
};

const AddPlot: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormData>(defaultForm);
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [loading, setLoading] = useState(false);
  const { data: categories } = useLiveCollection<PlotCategoryDoc>('plotCategories');
  const isEdit = !!id;

  useEffect(() => {
    if (isEdit) {
      getDocument<Plot>('plots', id!).then(plot => {
        if (plot) {
          setForm({
            plotNumber:  plot.plotNumber,
            block:       plot.block,
            size:        String(plot.size),
            sizeUnit:    plot.sizeUnit,
            category:    plot.category,
            status:      plot.status,
            location:    plot.location || '',
            description: plot.description || '',
          });
        }
      });
    }
  }, [id, isEdit]);

  const validate = () => {
    const e: Partial<FormData> = {};
    if (!form.plotNumber.trim()) e.plotNumber = 'Plot number is required';
    if (!form.block.trim())      e.block = 'Block/Phase is required';
    if (!form.size || isNaN(Number(form.size)) || Number(form.size) <= 0)
      e.size = 'Valid size is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      setLoading(true);
      const data = {
        plotNumber:  form.plotNumber.trim().toUpperCase(),
        block:       form.block.trim().toUpperCase(),
        size:        Number(form.size),
        sizeUnit:    form.sizeUnit,
        category:    form.category,
        // NOTE: totalPrice is NOT stored here — it is set per booking via per-marla rate
        status:      form.status,
        location:    form.location.trim(),
        description: form.description.trim(),
      };
      if (isEdit) {
        await updateDocument('plots', id!, data);
        toast.success('Plot updated successfully!');
      } else {
        await addDocument('plots', data);
        toast.success('Plot added successfully!');
      }
      navigate('/plots/list');
    } catch {
      toast.error('Failed to save plot. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const set = (k: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const allCategories = [
    'Residential', 'Commercial', 'Corner', 'Industrial',
    ...categories.map(c => c.name).filter(n =>
      !['Residential', 'Commercial', 'Corner', 'Industrial'].includes(n)
    ),
  ];

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Edit Plot' : 'Add New Plot'}
        subtitle="Enter plot details — pricing is set at booking time"
        icon={<Home size={20} />}
      />
      <div className="card max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Plot Number" required error={errors.plotNumber}>
              <input
                className={`input-field ${errors.plotNumber ? 'input-error' : ''}`}
                value={form.plotNumber}
                onChange={set('plotNumber')}
                placeholder="e.g., A-123"
              />
            </FormField>

            <FormField label="Block / Phase" required error={errors.block}>
              <input
                className={`input-field ${errors.block ? 'input-error' : ''}`}
                value={form.block}
                onChange={set('block')}
                placeholder="e.g., A"
              />
            </FormField>

            <FormField label="Plot Size" required error={errors.size}>
              <input
                className={`input-field ${errors.size ? 'input-error' : ''}`}
                type="number"
                value={form.size}
                onChange={set('size')}
                placeholder="e.g., 5"
                min="0"
                step="0.1"
              />
            </FormField>

            <FormField label="Size Unit">
              <select className="input-field" value={form.sizeUnit} onChange={set('sizeUnit')}>
                {['Marla', 'Kanal', 'Sq.Ft'].map(u => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Category">
              <select className="input-field" value={form.category} onChange={set('category')}>
                {allCategories.map(c => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Status">
              <select className="input-field" value={form.status} onChange={set('status')}>
                {['available', 'reserved', 'booked', 'sold', 'cancelled'].map(s => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Location / Area">
              <input
                className="input-field"
                value={form.location}
                onChange={set('location')}
                placeholder="e.g., Phase 1, Main Boulevard"
              />
            </FormField>
          </div>

          {/* Info note */}
          <div
            className="flex items-start gap-2 p-3 rounded-xl text-xs"
            style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af' }}
          >
            <span className="text-base leading-none mt-0.5">ℹ️</span>
            <span>
              <strong>Pricing note:</strong> Total price is not entered here. It will be calculated
              automatically in the Booking form using the <em>Per Marla Rate × Plot Size</em>.
            </span>
          </div>

          <FormField label="Description">
            <textarea
              className="input-field h-24 resize-none"
              value={form.description}
              onChange={set('description')}
              placeholder="Additional details about this plot..."
            />
          </FormField>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn btn-primary disabled:opacity-60">
              <Save size={16} /> {loading ? 'Saving...' : (isEdit ? 'Update Plot' : 'Add Plot')}
            </button>
            <button type="button" onClick={() => navigate('/plots/list')} className="btn btn-secondary">
              <X size={16} /> Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddPlot;
