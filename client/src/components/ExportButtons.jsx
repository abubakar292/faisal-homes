import { FileSpreadsheet, FileDown } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { qs } from '../lib/api.js';

export default function ExportButtons({ report, params }) {
  const { can } = useAuth();
  if (!can('report.view')) return null;
  const q = (format) => `/api/reports/${report}${qs({ ...params, format })}`;
  return (
    <>
      <a className="btn-secondary" href={q('xlsx')}><FileSpreadsheet className="h-4 w-4 text-emerald-700" />Excel</a>
      <a className="btn-secondary" href={q('pdf')} target="_blank" rel="noreferrer"><FileDown className="h-4 w-4 text-red-700" />PDF</a>
    </>
  );
}
