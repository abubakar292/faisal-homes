import React, { useEffect, useState } from 'react';
import { Users, Plus, Trash2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import FormField from '../../components/ui/FormField';
import { getCollection, setDocument, updateDocument, deleteDocument } from '../../firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import type { AppUser } from '../../types';

const UsersManagement: React.FC = () => {
  const { isAdmin, createUser } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'staff' });
  const [loading, setLoading] = useState(false);

  const load = () => getCollection<AppUser>('users').then(setUsers);
  useEffect(() => { load(); }, []);

  if (!isAdmin) return (
    <div className="card text-center py-16">
      <p className="text-slate-500">Access restricted to administrators.</p>
    </div>
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      toast.error('All fields are required');
      return;
    }
    if (form.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    try {
      setLoading(true);
      const uid = await createUser(form.email, form.password);
      await setDocument('users', uid, {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role as AppUser['role'],
        active: true,
        createdAt: new Date(),
      });
      toast.success('User created successfully!');
      setShowModal(false);
      setForm({ name: '', email: '', password: '', role: 'staff' });
      await load();
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/email-already-in-use') toast.error('Email already in use');
      else toast.error('Failed to create user');
    } finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await updateDocument('users', deleteId, { active: false });
      toast.success('User deactivated');
      await load();
    } catch { toast.error('Failed'); } finally { setDeleteId(null); }
  };

  const toggleRole = async (user: AppUser) => {
    const newRole = user.role === 'admin' ? 'staff' : 'admin';
    await updateDocument('users', user.id, { role: newRole });
    toast.success(`Role changed to ${newRole}`);
    await load();
  };

  return (
    <div>
      <PageHeader
        title="Users Management"
        subtitle="Manage system users and roles"
        icon={<Users size={20} />}
        actions={<button onClick={() => setShowModal(true)} className="btn-primary"><Plus size={16} /> Add User</button>}
      />
      {/* Mobile Card List (< md) */}
      <div className="md:hidden space-y-3">
        {users.map(user => (
          <div key={user.id} className="card p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-bold text-slate-800 text-sm">{user.name}</h4>
                <p className="text-xs text-slate-500 break-anywhere">{user.email}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${user.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-600'}`}>
                  {user.role}
                </span>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${user.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {user.active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => toggleRole(user)}
                className="text-xs px-3 py-1.5 min-h-[36px] bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-semibold"
              >
                Toggle Role
              </button>
              <button
                type="button"
                onClick={() => setDeleteId(user.id)}
                aria-label="Deactivate user"
                className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center hover:bg-red-50 rounded-lg text-red-500"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {users.length === 0 && (
          <div className="card text-center py-10 text-slate-400">No users found</div>
        )}
      </div>

      {/* Desktop Table (>= md) */}
      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>{['Name', 'Email', 'Role', 'Status', 'Actions'].map(h => <th key={h} className="table-th">{h}</th>)}</tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className="table-row">
                <td className="table-td font-medium">{user.name}</td>
                <td className="table-td text-slate-500">{user.email}</td>
                <td className="table-td">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${user.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-600'}`}>
                    {user.role}
                  </span>
                </td>
                <td className="table-td">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${user.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {user.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="table-td">
                  <div className="flex gap-1">
                    <button onClick={() => toggleRole(user)} className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700">
                      Toggle Role
                    </button>
                    <button onClick={() => setDeleteId(user.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} className="table-td text-center py-10 text-slate-400">No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add New User" size="sm">
        <form onSubmit={handleCreate} className="space-y-4">
          <FormField label="Full Name" required>
            <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="John Doe" />
          </FormField>
          <FormField label="Email" required>
            <input className="input-field" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="user@company.com" />
          </FormField>
          <FormField label="Password" required hint="Minimum 6 characters">
            <input className="input-field" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••" />
          </FormField>
          <FormField label="Role">
            <select className="input-field" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="staff">Staff (Limited Access)</option>
              <option value="admin">Admin (Full Access)</option>
            </select>
          </FormField>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center"><Save size={15} /> {loading ? 'Creating...' : 'Create User'}</button>
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete}
        title="Deactivate User" message="This will deactivate the user account. They won't be able to log in." confirmLabel="Deactivate" />
    </div>
  );
};

export default UsersManagement;
