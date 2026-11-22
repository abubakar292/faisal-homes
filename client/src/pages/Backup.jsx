import { useRef, useState } from 'react';
import { DatabaseBackup, Download, RotateCcw, Upload, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi, useRefreshAll } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { dateTime } from '../lib/format.js';
import { Card, ErrorBox, Input, Loading, Modal, Notice, PageHeader, Spinner, useToast } from '../components/ui.jsx';

const KIND = { manual: 'Manual', auto: 'Automatic', startup: 'Catch-up (startup)', 'pre-restore': 'Safety (before restore)', 'pre-migration': 'Safety (before upgrade)' };

export default function BackupPage() {
  const { settings } = useAuth();
  const toast = useToast(); const refresh = useRefreshAll();
  const { data, isLoading, error } = useApi('/backup');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [restore, setRestore] = useState(null);
  const [word, setWord] = useState('');
  const [rErr, setRErr] = useState(null);
  const [rBusy, setRBusy] = useState(false);
  const fileRef = useRef();
  const backupNow = async () => {
    setBusy(true); setErr(null);
    try { const r = await api.post('/backup'); toast(`Backup created: ${r.name}`); refresh(); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const doRestore = async () => {
    setRErr(null); setRBusy(true);
    try {
      if (restore.upload) {
        const f = fileRef.current?.files?.[0];
        if (!f) throw new Error('Choose the backup .zip file');
        const fd = new FormData(); fd.append('confirm', word); fd.append('file', f);
        await api.upload('/backup/restore-upload', fd);
      } else await api.post(`/backup/restore/${restore.name}`, { confirm: word });
      window.location.href = '/';
    } catch (e) { setRErr(e); setRBusy(false); }
  };
  const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;
  return (
    <>
      <PageHeader title="Backup & Restore" subtitle="Your land, customer and financial records — protect them with regular backups"
        actions={<><a className="btn-secondary" href="/api/backup/export.xlsx"><FileSpreadsheet className="h-4 w-4 text-emerald-700" />Export all data (Excel)</a>
          <button type="button" className="btn-primary" onClick={backupNow} disabled={busy}>{busy ? <Spinner className="h-4 w-4 text-white" /> : <DatabaseBackup className="h-4 w-4" />}Backup now</button></>} />
      <ErrorBox error={err || error} className="mb-4" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Backups" className="lg:col-span-2" bodyClass="p-0">
          {isLoading ? <Loading /> : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50"><tr><th className="th">Created</th><th className="th">Type</th><th className="th text-right">Size</th><th className="th" /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.backups.map((b) => (
                    <tr key={b.name}>
                      <td className="td"><div className="font-medium">{dateTime(b.created_at)}</div><div className="font-mono text-[11px] text-slate-500">{b.name}</div></td>
                      <td className="td">{KIND[b.kind] || b.kind}</td><td className="td num">{mb(b.size)}</td>
                      <td className="td whitespace-nowrap text-right">
                        <a className="btn-ghost btn-sm" href={`/api/backup/download/${b.name}`}><Download className="h-4 w-4" />Download</a>
                        <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => { setRestore(b); setWord(''); setRErr(null); }}><RotateCcw className="h-4 w-4" />Restore</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.backups.length && <p className="p-6 text-center text-sm text-slate-500">No backups yet. Click “Backup now”.</p>}
            </div>
          )}
        </Card>
        <div className="space-y-5">
          <Card title="Protection status">
            <div className="flex items-start gap-3 text-sm">
              <ShieldCheck className={`h-8 w-8 shrink-0 ${settings ? 'text-emerald-600' : 'text-slate-400'}`} />
              <div className="space-y-1 text-slate-600">
                <p>Each backup contains the <b>complete database</b> and all <b>uploaded documents</b>.</p>
                <p>Automatic daily backups are configured in Settings → Automatic backup.</p>
                <p>Keep a copy away from the office: download backups to a USB drive, or set <code>BACKUP_COPY_DIR</code> to a Google Drive / OneDrive folder.</p>
              </div>
            </div>
          </Card>
          <Card title="Restore from a file">
            <p className="mb-3 text-sm text-slate-600">Restore a backup .zip downloaded earlier (for example on a new computer).</p>
            <button type="button" className="btn-secondary w-full" onClick={() => { setRestore({ upload: true }); setWord(''); setRErr(null); }}><Upload className="h-4 w-4" />Upload backup & restore</button>
          </Card>
        </div>
      </div>
      <Modal open={!!restore} onClose={() => !rBusy && setRestore(null)} title="Restore backup" size="sm"
        footer={<><button type="button" className="btn-secondary" onClick={() => setRestore(null)} disabled={rBusy}>Cancel</button><button type="button" className="btn-danger" onClick={doRestore} disabled={word !== 'RESTORE' || rBusy}>{rBusy && <Spinner className="h-4 w-4 text-white" />}Restore now</button></>}>
        <Notice tone="warn" className="mb-3"><b>All current data will be replaced</b> by the data in this backup{restore?.name ? ` (${dateTime(restore.created_at)})` : ''}. A safety backup of the current data is made first. Everyone will be logged out.</Notice>
        {restore?.upload && <input ref={fileRef} type="file" accept=".zip" className="mb-3 block w-full text-sm" />}
        <Input label='Type RESTORE to confirm' value={word} onChange={(e) => setWord(e.target.value)} />
        <ErrorBox error={rErr} className="mt-3" />
      </Modal>
    </>
  );
}
