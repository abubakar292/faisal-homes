import React, { useEffect, useState } from 'react';
import { FileText, Printer } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { getDocument } from '../../firebase/firestore';
import { printInNewWindow } from '../../utils/printUtils';
import { buildLetterheadDocument } from '../../utils/letterhead';
import type { CompanySettings } from '../../types';

const TermsAndConditions: React.FC = () => {
  const [company, setCompany] = useState<CompanySettings | null>(null);

  useEffect(() => {
    getDocument<CompanySettings>('settings', 'company').then(s => {
      if (s) setCompany(s);
    });
  }, []);

  const handlePrint = () => {
    if (!company) return;
    
    const termsHtml = `
      <div style="font-size:10.5pt;line-height:1.8;white-space:pre-wrap;color:#334155;padding:10px 0;">
        ${company.termsAndConditions || 'No terms and conditions specified.'}
      </div>
    `;
    const docHtml = buildLetterheadDocument({
      sections: [{ title: 'Policies, Terms & Conditions', bodyHtml: termsHtml }]
    });
    printInNewWindow(docHtml, 'Policies, Terms & Conditions');
  };

  return (
    <div>
      <PageHeader 
        title="Terms & Conditions" 
        subtitle="View and print company terms" 
        icon={<FileText size={20} />} 
      />

      <div className="card max-w-4xl mx-auto">
        <div className="flex justify-end mb-6">
          <button onClick={handlePrint} className="btn-primary" disabled={!company}>
            <Printer size={16} /> Print Document
          </button>
        </div>

        <div className="p-4 sm:p-8 border border-slate-200 rounded-xl bg-white min-h-[400px]">
          <h1 className="text-2xl font-bold text-center text-slate-800 mb-2">
            {company?.name || 'Company Name'}
          </h1>
          <h3 className="text-md text-center text-slate-500 mb-8 uppercase tracking-widest">
            Terms & Conditions
          </h3>
          
          {company?.termsAndConditions ? (
            <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {company.termsAndConditions}
            </div>
          ) : (
            <div className="text-center py-20 text-slate-400">
              <FileText size={48} className="mx-auto mb-4 opacity-50" />
              <p>No terms and conditions have been added yet.</p>
              <p className="text-sm mt-2">Go to Settings &gt; Company Info to add them.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TermsAndConditions;
