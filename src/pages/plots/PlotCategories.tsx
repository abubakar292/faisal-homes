import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Grid } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import FormField from '../../components/ui/FormField';
import { getCollection, addDocument, updateDocument, deleteDocument } from '../../firebase/firestore';
import type { PlotCategoryDoc } from '../../types';

const PlotCategories: React.FC = () => {
  const [categories, setCategories] = useState<PlotCategoryDoc[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<PlotCategoryDoc | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', pricingNote: '' });
  const [loading, setLoading] = useState(false);

  const load = () => getCollection<PlotCategoryDoc>('plotCategories').then(setCategories);

  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditItem(null); setForm({ name: '', description: '', pricingNote: '' }); setShowModal(true); };
  const openEdit = (c: PlotCategoryDoc) => { setEditItem(c); setForm({ name: c.name, description: c.description, pricingNote: c.pricingNote }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Category name is required'); return; }
    try {
      setLoading(true);
      if (editItem) {
        await updateDocument('plotCategories', editItem.id, form);
        toast.success('Category updated');
      } else {
        await addDocument('plotCategories', form);
        toast.success('Category added');
      }
      await load();
      setShowModal(false);
    } catch { toast.error('Failed to save'); } finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      setLoading(true);
      await deleteDocument('plotCategories', deleteId);
      toast.success('Category deleted');
      await load();
    } catch { toast.error('Failed to delete'); } finally { setLoading(false); setDeleteId(null); }
  };

  return (
    <div>
      <PageHeader
        title="Plot Categories"
        subtitle="Manage property categories"
        icon={<Grid size={20} />}
        actions={<button onClick={openAdd} className="btn-primary"><Plus size={16} /> Add Category</button>}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {['Residential', 'Commercial', 'Corner', 'Industrial'].map(name => (
          <div key={name} className="card border-l-4 border-l-primary/40">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-slate-800">{name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">Built-in category</p>
              </div>
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">System</span>
            </div>
          </div>
        ))}
        {categories.map(cat => (
          <div key={cat.id} className="card border-l-4 border-l-accent">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-slate-800">{cat.name}</h3>
                {cat.description && <p className="text-xs text-slate-500 mt-0.5">{cat.description}</p>}
                {cat.pricingNote && <p className="text-xs text-amber-600 mt-1">{cat.pricingNote}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(cat)} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-500"><Pencil size={14} /></button>
                <button onClick={() => setDeleteId(cat.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500"><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
        {categories.length === 0 && (
          <div className="col-span-full text-center py-8 text-slate-400 text-sm">No custom categories. Add one!</div>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editItem ? 'Edit Category' : 'Add Category'} size="sm">
        <div className="space-y-4">
          <FormField label="Category Name" required>
            <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g., Farmhouse" />
          </FormField>
          <FormField label="Description">
            <input className="input-field" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
          </FormField>
          <FormField label="Pricing Note">
            <input className="input-field" value={form.pricingNote} onChange={e => setForm(f => ({ ...f, pricingNote: e.target.value }))} placeholder="e.g., Premium pricing applies" />
          </FormField>
          <div className="flex gap-3 pt-1">
            <button onClick={handleSave} disabled={loading} className="btn-primary flex-1 justify-center">{loading ? 'Saving...' : 'Save'}</button>
            <button onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete}
        message="Delete this category? Plots using it won't be affected." loading={loading} />
    </div>
  );
};

export default PlotCategories;
