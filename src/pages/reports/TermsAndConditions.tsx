import React, { useEffect, useState } from 'react';
import { FileText, Printer } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { getDocument } from '../../firebase/firestore';
import { printInNewWindow } from '../../utils/printUtils';
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
    
    const html = `
      <div class="company-header">
        <div>
          <div class="company-name">${company.name}</div>
          <div class="company-sub">${company.address || ''} ${company.phone ? '| ' + company.phone : ''}</div>
        </div>
        <div class="company-right">Print Date: ${new Date().toLocaleDateString('en-GB')}</div>
      </div>
      <div class="doc-title-band">TERMS & CONDITIONS</div>
      <div style="padding: 16px; font-size: 11px; line-height: 1.7; white-space: pre-wrap; color: #333;">
        ${company.termsAndConditions || 'No terms and conditions specified.'}
      </div>
    `;
    printInNewWindow(html, 'Terms and Conditions');
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
