import { useRef, useState } from 'react';
import { FileText, Trash2, Upload, Eye } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi, useRefreshAll } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { dateTime } from '../lib/format.js';
import { Card, ConfirmDialog, ErrorBox, Select, Input, Spinner, useToast, Empty } from './ui.jsx';

export const DOC_TYPES = [
  ['PHOTO', 'Photograph'], ['CNIC_FRONT', 'CNIC Front'], ['CNIC_BACK', 'CNIC Back'], ['BOOKING_FORM', 'Booking Form'], ['SALE_AGREEMENT', 'Sale Agreement'],
  ['PAYMENT_RECEIPT', 'Payment Receipt'], ['TRANSFER_DOCUMENT', 'Transfer Document'], ['REGISTRY', 'Registry'], ['MUTATION', 'Mutation (Intiqal)'],
  ['OWNERSHIP_DOCUMENT', 'Ownership Document'], ['EXPENSE_RECEIPT', 'Expense Receipt / Bill'], ['LEGAL_DOCUMENT', 'Legal Document'], ['OTHER', 'Other'],
];
const label = (k) => Object.fromEntries(DOC_TYPES)[k] || k;

export default function DocumentsPanel({ entityType, entityId, types, title = 'Documents', compact }) {
  const { can } = useAuth();
  const toast = useToast();
  const refresh = useRefreshAll();
  const url = can('document.view') ? `/documents?entity_type=${entityType}&entity_id=${entityId}` : null;
  const { data, isLoading } = useApi(url);
  const [docType, setDocType] = useState((types && types[0]) || 'OTHER');
  const [docTitle, setDocTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [del, setDel] = useState(null);
  const fileRef = useRef();
  if (!can('document.view')) return null;
  const options = DOC_TYPES.filter(([k]) => !types || types.includes(k));
  const upload = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) { setErr(new Error('Choose a file first')); return; }
    const fd = new FormData();
    fd.append('entity_type', entityType); fd.append('entity_id', String(entityId)); fd.append('doc_type', docType); fd.append('title', docTitle); fd.append('file', f);
    setBusy(true); setErr(null);
    try { await api.upload('/documents', fd); toast('Document uploaded'); fileRef.current.value = ''; setDocTitle(''); refresh(); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Card title={title} bodyClass={compact ? 'p-3' : 'p-4 sm:p-5'}>
      {isLoading ? <Spinner /> : (data || []).length ? (
        <ul className="divide-y divide-slate-100">
          {data.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2">
              {d.mime_type.startsWith('image/') ? <img src={`/api/documents/${d.id}/file`} alt="" className="h-11 w-11 rounded border object-cover" />
                : <div className="flex h-11 w-11 items-center justify-center rounded border bg-slate-50"><FileText className="h-5 w-5 text-slate-500" /></div>}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">{label(d.doc_type)}{d.title ? ` — ${d.title}` : ''}</div>
                <div className="truncate text-xs text-slate-500">{d.original_name} · {(d.size_bytes / 1024).toFixed(0)} KB · {dateTime(d.uploaded_at)} · {d.uploaded_by_name}</div>
              </div>
              <a className="btn-ghost btn-sm" href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer"><Eye className="h-4 w-4" />View</a>
              {can('document.delete') && <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => setDel(d)}><Trash2 className="h-4 w-4" /></button>}
            </li>
          ))}
        </ul>
      ) : <Empty text="No documents uploaded." />}
      {can('document.upload') && (
        <div className="mt-3 grid gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
          <Select label="Type" options={options} value={docType} onChange={(e) => setDocType(e.target.value)} />
          <Input label="Title (optional)" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
          <label className="block"><span className="label">File (image, PDF, Word, Excel)</span>
            <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white" />
          </label>
          <button type="button" className="btn-primary" onClick={upload} disabled={busy}>{busy ? <Spinner className="h-4 w-4 text-white" /> : <Upload className="h-4 w-4" />}Upload</button>
          <ErrorBox error={err} className="sm:col-span-4" />
        </div>
      )}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title="Remove document" danger confirmText="Remove"
        message="The document will be hidden from this record. The file is kept in backups for audit purposes."
        onConfirm={async () => { await api.del(`/documents/${del.id}`); toast('Document removed'); refresh(); }} />
    </Card>
  );
}
