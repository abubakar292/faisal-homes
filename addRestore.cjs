const fs = require('fs');
let c = fs.readFileSync('src/pages/settings/BackupData.tsx', 'utf8');

if (!c.includes('setDocument')) {
  c = c.replace(/import \{ getCollection \} from '\.\.\/\.\.\/firebase\/firestore';/, "import { getCollection, setDocument } from '../../firebase/firestore';");
}
if (!c.includes('Upload')) {
  c = c.replace(/Database, Download, Cloud, CloudOff, RefreshCw/, "Database, Download, Upload, Cloud, CloudOff, RefreshCw");
}

if (!c.includes('handleRestore')) {
  const restoreFunc = `
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

        toast.success(\`Restore complete! Restored \${restoredCount} records.\`, { id: 'restore' });
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
`;
  c = c.replace(/const handleLocalBackup = async \(\) => \{/, restoreFunc + '\n  $&');
}

c = c.replace(/md:grid-cols-2 gap-5 max-w-3xl/, 'lg:grid-cols-3 gap-5 max-w-5xl');

if (!c.includes('Restore Backup')) {
  const restoreUI = `
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
`;
  c = c.replace(/\{\/\* Local Download \*\/\}/, restoreUI + '\n\n        {/* Local Download */}');
}

fs.writeFileSync('src/pages/settings/BackupData.tsx', c);
console.log('BackupData.tsx updated with restore functionality.');
