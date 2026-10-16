import React, { useState } from 'react';
import { User, UserPlus, CheckCircle, AlertTriangle, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import SearchableSelect from '../ui/SearchableSelect';
import CustomerFormFields from '../forms/CustomerFormFields';
import NomineeFields from '../forms/NomineeFields';
import DocumentUploads from '../forms/DocumentUploads';
import type { Customer, Sale, NomineeDetails, CustomerDocuments } from '../../types';
import type { CustomerFormData } from '../../utils/customerForm';

interface CustomerSectionProps {
  customers: Customer[];
  activeSales: Sale[];
  customerMode: 'existing' | 'new';
  setCustomerMode: (mode: 'existing' | 'new') => void;
  selectedCustomerId: string;
  onSelectCustomerId: (id: string) => void;
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
  activeSales,
  customerMode,
  setCustomerMode,
  selectedCustomerId,
  onSelectCustomerId,
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

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  const customerPlotsCount = selectedCustomerId
    ? activeSales.filter(s => s.customerId === selectedCustomerId && s.status !== 'cancelled').length
    : 0;

  // Duplicate CNIC check in "new" customer mode
  const duplicateCustomer =
    customerMode === 'new' && newCustomer.cnic.trim().length >= 15
      ? customers.find(c => c.cnic === newCustomer.cnic.trim())
      : null;

  return (
    <div className="space-y-5">
      {/* Tab toggle: Existing Customer | New Customer */}
      {!isLocked && (
        <div className="flex p-1 bg-slate-100 rounded-xl w-full sm:w-80">
          <button
            type="button"
            onClick={() => setCustomerMode('existing')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
              customerMode === 'existing'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <User size={14} /> Existing Customer
          </button>
          <button
            type="button"
            onClick={() => setCustomerMode('new')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
              customerMode === 'new'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserPlus size={14} /> New Customer
          </button>
        </div>
      )}

      {/* Mode: Existing Customer */}
      {customerMode === 'existing' && (
        <div className="space-y-4">
          <div>
            <label className="label">
              Select Customer <span className="text-red-500">*</span>
            </label>
            <SearchableSelect
              value={selectedCustomerId}
              onChange={onSelectCustomerId}
              options={customers.map(c => ({
                value: c.id,
                label: c.name,
                sublabel: `${c.customerId || ''} · ${c.cnic} · ${c.phone}`,
              }))}
              placeholder="Search by name, CNIC, or customer ID..."
              disabled={isLocked}
              error={!!errors.customerId}
            />
            {errors.customerId && (
              <p className="text-xs text-red-500 font-medium mt-1">
                {errors.customerId}
              </p>
            )}
          </div>

          {selectedCustomer && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    {selectedCustomer.name}
                  </h4>
                  <p className="text-xs text-slate-500">
                    ID: {selectedCustomer.customerId || '—'} · S/O {selectedCustomer.fatherName}
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                    <FileText size={12} /> {customerPlotsCount} Active {customerPlotsCount === 1 ? 'Plot' : 'Plots'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200/60 text-xs text-slate-600">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">CNIC</span>
                  <span className="font-mono">{selectedCustomer.cnic}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Phone</span>
                  <span>{selectedCustomer.phone}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">City</span>
                  <span>{selectedCustomer.city || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Address</span>
                  <span className="truncate block" title={selectedCustomer.address}>
                    {selectedCustomer.address || '—'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mode: New Customer */}
      {customerMode === 'new' && (
        <div className="space-y-5">
          {duplicateCustomer && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
                <span>
                  Customer with CNIC <strong>{duplicateCustomer.cnic}</strong> already exists: <strong>{duplicateCustomer.name}</strong> ({duplicateCustomer.customerId || ''}).
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCustomerMode('existing');
                  onSelectCustomerId(duplicateCustomer.id);
                }}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg text-xs flex-shrink-0 transition-colors"
              >
                Use existing customer
              </button>
            </div>
          )}

          <CustomerFormFields
            form={newCustomer}
            onChange={onNewCustomerChange}
            errors={errors}
            collapsibleOptional={true}
          />

          <div className="pt-2 border-t border-slate-100">
            <NomineeFields
              nominee={nominee}
              onChange={onNomineeChange}
              errors={errors}
            />
          </div>

          {/* Collapsible Document Uploads */}
          <div className="pt-2 border-t border-slate-100">
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
      )}
    </div>
  );
};

export default CustomerSection;
