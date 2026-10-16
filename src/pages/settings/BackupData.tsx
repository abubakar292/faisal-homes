import React, { useState, useEffect, useCallback } from 'react';
import { Database, Download, Upload, Cloud, CloudOff, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import { getCollection, setDocument } from '../../firebase/firestore';
import type { Plot, Customer, Booking, Sale, Installment, Dealer, PaymentPlan } from '../../types';

const BACKUP_FILENAME = 'FaisalHomesBackup.json';
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
const DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.file';

declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient: (config: Record<string, unknown>) => { requestAccessToken: () => void }; revokeAccessToken: (token: string) => void } } };
  }
}

const BackupData: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [driveLoading, setDriveLoading] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [lastBackup, setLastBackup] = useState<string | null>(localStorage.getItem('lastGoogleDriveBackup'));
  const [gsiLoaded, setGsiLoaded] = useState(false);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => setGsiLoaded(true);
    document.head.appendChild(script);
  }, []);

  const fetchAllData = async () => {
    toast.loading('Fetching all data...', { id: 'backup' });
    const [plots, customers, bookings, sales, installments, dealers, paymentPlans] = await Promise.all([
      getCollection<Plot>('plots'),
      getCollection<Customer>('customers'),
      getCollection<Booking>('bookings'),
      getCollection<Sale>('sales'),
      getCollection<Installment>('installments'),
      getCollection<Dealer>('dealers'),
      getCollection<PaymentPlan>('paymentPlans'),
    ]);
    return {
      exportDate: new Date().toISOString(),
      data: { plots, customers, bookings, sales, installments, dealers, paymentPlans }
    };
  };

  
  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!window.confirm('Are you sure you want to restore? This will overwrite existing records with matching IDs.')) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        setLoading(true);
        toast.loading('Restoring data...', { id: 'restore' });
        const text = ev.target?.result as string;
        const backup = JSON.parse(text);
        
        if (!backup.data || !backup.data.plots) {
          throw new Error('Invalid backup file format.');
        }

        const collections = ['plots', 'customers', 'bookings', 'sales', 'installments', 'dealers', 'paymentPlans'];
        let restoredCount = 0;

        for (const col of collections) {
          const items = backup.data[col] || [];
          for (const item of items) {
            const id = item.id;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id: _, ...rest } = item;
            await setDocument(col, id, rest);
            restoredCount++;
          }
        }

        toast.success(`Restore complete! Restored ${restoredCount} records.`, { id: 'restore' });
      } catch (err) {
        console.error(err);
        toast.error('Failed to restore. Invalid file or network error.', { id: 'restore' });
      } finally {
        setLoading(false);
        e.target.value = ''; // Reset input
      }
    };
    reader.readAsText(file);
  };

  const handleLocalBackup = async () => {
    try {
      setLoading(true);
      const backup = await fetchAllData();
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `faisal-homes-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded successfully!', { id: 'backup' });
    } catch {
      toast.error('Backup failed', { id: 'backup' });
    } finally {
      setLoading(false);
    }
  };

  const authenticateGoogle = useCallback(() => {
    return new Promise<string>((resolve, reject) => {
      if (!window.google?.accounts?.oauth2) {
        reject(new Error('Google Identity Services not loaded'));
        return;
      }
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPES,
        callback: (tokenResponse: { access_token?: string; error?: string }) => {
          if (tokenResponse.error) {
            reject(new Error(tokenResponse.error));
          } else if (tokenResponse.access_token) {
            resolve(tokenResponse.access_token);
          } else {
            reject(new Error('No access token received'));
          }
        },
      });
      client.requestAccessToken();
    });
  }, []);

  const findExistingBackup = async (token: string): Promise<string | null> => {
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${BACKUP_FILENAME}' and trashed=false&fields=files(id,name,modifiedTime)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.files?.[0]?.id || null;
  };

  const handleGoogleDriveBackup = async () => {
    try {
      setDriveLoading(true);
      toast.loading('Connecting to Google Drive...', { id: 'backup' });

      let token = accessToken;
      if (!token) {
        token = await authenticateGoogle();
        setAccessToken(token);
      }

      toast.loading('Fetching all data...', { id: 'backup' });
      const backup = await fetchAllData();
      const json = JSON.stringify(backup, null, 2);
      const file = new Blob([json], { type: 'application/json' });

      const existingId = await findExistingBackup(token);

      if (existingId) {
        toast.loading('Updating existing backup file...', { id: 'backup' });
        const metadata = { name: BACKUP_FILENAME };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', file);

        const resp = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`,
          { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: form }
        );
        if (!resp.ok) throw new Error('Failed to update file');
      } else {
        toast.loading('Creating backup file on Google Drive...', { id: 'backup' });
        const metadata = { name: BACKUP_FILENAME, mimeType: 'application/json' };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', file);

        const resp = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
          { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
        );
        if (!resp.ok) throw new Error('Failed to create file');
      }

      const now = new Date().toISOString();
      setLastBackup(now);
      localStorage.setItem('lastGoogleDriveBackup', now);
      toast.success('Backup saved to Google Drive!', { id: 'backup' });
    } catch (err) {
      console.error(err);
      setAccessToken('');
      toast.error('Google Drive backup failed. Please try again.', { id: 'backup' });
    } finally {
      setDriveLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="Backup Data" subtitle="Export or backup to Google Drive" icon={<Database size={20} />} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 max-w-5xl">

        
        {/* Restore Backup */}
        <div className="card text-center relative">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: '#e0e7ff' }}>
            <Upload size={28} style={{ color: '#4338ca' }} />
          </div>
          <h3 className="font-semibold text-slate-800 text-lg mb-2">Restore Backup</h3>
          <p className="text-slate-500 text-sm mb-6 leading-relaxed">
            Upload a previously downloaded JSON file to restore your data.
          </p>
          <label className="btn btn-primary justify-center mx-auto cursor-pointer flex items-center gap-2" style={{ width: 'fit-content' }}>
            <Upload size={16} /> {loading ? 'Processing...' : 'Restore File'}
            <input type="file" accept=".json" className="hidden" onChange={handleRestore} disabled={loading} />
          </label>
        </div>


        {/* Local Download */}
        <div className="card text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Download size={28} className="text-primary" />
          </div>
          <h3 className="font-semibold text-slate-800 text-lg mb-2">Download Backup</h3>
          <p className="text-slate-500 text-sm mb-6 leading-relaxed">
            Download a JSON file with all your data to your computer.
          </p>
          <button onClick={handleLocalBackup} disabled={loading} className="btn-primary justify-center disabled:opacity-60 mx-auto">
            <Download size={16} /> {loading ? 'Exporting...' : 'Download Backup'}
          </button>
        </div>

        {/* Google Drive */}
        <div className="card text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: accessToken ? '#dcfce7' : '#f1f5f9' }}>
            {accessToken
              ? <Cloud size={28} className="text-green-600" />
              : <CloudOff size={28} className="text-slate-400" />
            }
          </div>
          <h3 className="font-semibold text-slate-800 text-lg mb-2">Google Drive Backup</h3>
          <p className="text-slate-500 text-sm mb-4 leading-relaxed">
            Save backup to Google Drive. Creates or updates a single file: <strong>{BACKUP_FILENAME}</strong>
          </p>

          {lastBackup && (
            <p className="text-xs text-slate-400 mb-3">
              Last backup: {new Date(lastBackup).toLocaleString('en-PK')}
            </p>
          )}

          <button
            onClick={handleGoogleDriveBackup}
            disabled={driveLoading || !gsiLoaded}
            className="btn btn-primary justify-center disabled:opacity-60 mx-auto"
          >
            {driveLoading
              ? <><RefreshCw size={16} className="animate-spin" /> Backing up...</>
              : <><Cloud size={16} /> {accessToken ? 'Backup Now' : 'Connect & Backup'}</>
            }
          </button>

          {!gsiLoaded && (
            <p className="text-xs text-amber-500 mt-2">Loading Google services...</p>
          )}
        </div>
      </div>

      {/* Config note */}
      {GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com' && (
        <div className="card max-w-3xl mt-5 p-4" style={{ background: '#fef3c7', border: '1px solid #fde68a' }}>
          <p className="text-sm font-semibold" style={{ color: '#b45309' }}>Setup Required</p>
          <p className="text-xs mt-1" style={{ color: '#92400e' }}>
            To enable Google Drive backup, create a Google Cloud project at{' '}
            <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="underline font-bold">
              console.cloud.google.com
            </a>, enable the Drive API, create OAuth 2.0 credentials, and replace <code>YOUR_GOOGLE_CLIENT_ID</code> in{' '}
            <code>src/pages/settings/BackupData.tsx</code>.
          </p>
        </div>
      )}
    </div>
  );
};

export default BackupData;
