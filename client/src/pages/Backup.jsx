import { FileSpreadsheet, ShieldCheck, DatabaseBackup } from 'lucide-react';
import { Card, Notice, PageHeader } from '../components/ui.jsx';

/** Backups of the database are made by Supabase; this page keeps the full Excel export. */
export default function BackupPage() {
  return (
    <>
      <PageHeader title="Backup & Export" subtitle="Your land, customer and financial records"
        actions={<a className="btn-primary" href="/api/backup/export.xlsx"><FileSpreadsheet className="h-4 w-4" />Export all data (Excel)</a>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Database backups (Supabase)">
          <div className="flex items-start gap-3 text-sm text-slate-600">
            <DatabaseBackup className="h-8 w-8 shrink-0 text-navy-700" />
            <div className="space-y-2">
              <p>The database is hosted on Supabase. Supabase makes the backups: open the Supabase dashboard → <b>Database → Backups</b>.</p>
              <p>Daily backups are included in Supabase's paid (Pro) plan. On the free plan there are no automatic backups, so download the Excel export regularly.</p>
              <p>Uploaded documents (CNIC copies, agreements, bills) are kept in Supabase Storage, bucket <b>documents</b>.</p>
            </div>
          </div>
        </Card>
        <Card title="Export all data">
          <div className="flex items-start gap-3 text-sm text-slate-600">
            <ShieldCheck className="h-8 w-8 shrink-0 text-emerald-600" />
            <div className="space-y-2">
              <p>One Excel workbook with every table (lands, plots, customers, bookings, installments, receipts, expenses, cash book…). It can be read without this software.</p>
              <p>Keep a copy off-site, for example on a USB drive or Google Drive.</p>
            </div>
          </div>
          <a className="btn-secondary mt-4 w-full" href="/api/backup/export.xlsx"><FileSpreadsheet className="h-4 w-4 text-emerald-700" />Download Excel export</a>
        </Card>
      </div>
      <Notice className="mt-5">Restoring a backup is done in the Supabase dashboard, not from this page.</Notice>
    </>
  );
}
