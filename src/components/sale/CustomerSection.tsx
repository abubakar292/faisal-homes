import React, { useState } from 'react';
import { User, AlertTriangle, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import CustomerFormFields from '../forms/CustomerFormFields';
import NomineeFields from '../forms/NomineeFields';
import DocumentUploads from '../forms/DocumentUploads';
import type { Customer, NomineeDetails, CustomerDocuments } from '../../types';
import type { CustomerFormData } from '../../utils/customerForm';

interface CustomerSectionProps {
  customers: Customer[];
  newCustomer: CustomerFormData;
  onNewCustomerChange: (key: keyof CustomerFormData, val: string) => void;
  nominee: NomineeDetails;
  onNomineeChange: (key: keyof NomineeDetails, val: string) => void;
  documents: CustomerDocuments;
  onDocumentChange: (key: keyof CustomerDocuments, url: string) => void;
  tempCustomerId: string;
  errors: Record<string, string>;
  isLocked?: boolean;
}

export const CustomerSection: React.FC<CustomerSectionProps> = ({
  customers,
  newCustomer,
  onNewCustomerChange,
  nominee,
  onNomineeChange,
  documents,
  onDocumentChange,
  tempCustomerId,
  errors,
  isLocked = false,
}) => {
  const [showDocs, setShowDocs] = useState(false);

  // Duplicate CNIC check for informational notice
  const duplicateCustomer =
    newCustomer.cnic.trim().length >= 15
      ? customers.find(c => c.cnic.trim() === newCustomer.cnic.trim())
      : null;

  return (
    <div className="space-y-5">
      {duplicateCustomer && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
            <span>
              Note: A customer with CNIC <strong>{duplicateCustomer.cnic}</strong> is already registered ({duplicateCustomer.name}). Details will be updated for this sale.
            </span>
          </div>
        </div>
      )}

      {/* Customer Form Fields */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
          <User size={15} className="text-[#1a3c6e]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Customer Personal & Contact Details
          </h3>
        </div>

        <CustomerFormFields
          form={newCustomer}
          onChange={onNewCustomerChange}
          errors={errors}
          collapsibleOptional={false}
        />
      </div>

      {/* Nominee Details */}
      <div className="pt-4 border-t border-slate-100">
        <NomineeFields
          nominee={nominee}
          onChange={onNomineeChange}
          errors={errors}
        />
      </div>

      {/* Collapsible Document Uploads */}
      <div className="pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={() => setShowDocs(!showDocs)}
          className="flex items-center justify-between w-full p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-[#1a3c6e]" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Customer Documents & CNIC Uploads
            </span>
            <span className="text-[11px] text-slate-400 font-normal">
              (Optional - can upload now or later)
            </span>
          </div>
          {showDocs ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showDocs && (
          <div className="mt-3">
            <DocumentUploads
              customerId={tempCustomerId}
              documents={documents}
              onDocumentChange={onDocumentChange}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerSection;
