import React, { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { Upload, Eye, Loader, Check } from 'lucide-react';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';
import { storage } from '../../firebase/config';
import type { CustomerDocuments } from '../../types';

export interface UploadFieldProps {
  label: string;
  fieldKey: string;
  existingUrl?: string;
  customerId: string;
  onUploaded: (url: string) => void;
}

export const UploadField: React.FC<UploadFieldProps> = ({
  label,
  fieldKey,
  existingUrl,
  customerId,
  onUploaded,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(existingUrl || '');

  React.useEffect(() => {
    if (existingUrl) setPreview(existingUrl);
  }, [existingUrl]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !customerId) {
      toast.error('Save customer first, then upload documents');
      return;
    }
    try {
      setUploading(true);
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      if (!['jpg', 'jpeg', 'png', 'gif', 'pdf', 'webp'].includes(ext)) {
        toast.error('Only image or PDF files are allowed');
        setUploading(false);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File is too large (max 5 MB)');
        setUploading(false);
        return;
      }
      const path = `customers/${customerId}/${fieldKey}.${ext}`;
      const sRef = storageRef(storage, path);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      setPreview(url);
      onUploaded(url);
      toast.success(`${label} uploaded`);
    } catch (err) {
      console.error('Upload error:', err);
      const message =
        (err as { code?: string; message?: string } | undefined)?.message || 'Unknown error';
      if (message.includes('permission') || message.toLowerCase().includes('unauthorized')) {
        toast.error('Upload blocked. Check Firebase Storage security rules (no write access).');
      } else {
        toast.error(`Failed to upload ${label}: ${message}`);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="label">{label}</label>
      <div
        className="border-2 border-dashed rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:border-primary transition-colors"
        style={{
          borderColor: preview ? '#1a3c6e' : '#e2e8f0',
          background: preview ? '#eff6ff' : '#fafafa',
        }}
        onClick={() => inputRef.current?.click()}
      >
        {preview ? (
          <>
            <img
              src={preview}
              alt={label}
              className="w-16 h-12 object-cover rounded-lg border border-slate-200 flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-primary truncate flex items-center gap-1">
                <Check size={12} className="text-emerald-600" /> Uploaded
              </p>
              <p className="text-[11px] text-slate-400">Click to replace</p>
            </div>
            <a
              href={preview}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"
            >
              <Eye size={14} />
            </a>
          </>
        ) : (
          <>
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: '#f1f5f9' }}
            >
              {uploading ? (
                <Loader size={16} className="animate-spin text-primary" />
              ) : (
                <Upload size={16} className="text-slate-400" />
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-slate-600">
                {uploading ? 'Uploading...' : 'Click to upload'}
              </p>
              <p className="text-[11px] text-slate-400">JPG, PNG, PDF</p>
            </div>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
};

interface DocumentUploadsProps {
  customerId: string;
  documents: CustomerDocuments;
  onDocumentChange: (key: keyof CustomerDocuments, url: string) => void;
}

export const DocumentUploads: React.FC<DocumentUploadsProps> = ({
  customerId,
  documents,
  onDocumentChange,
}) => {
  return (
    <div className="card max-w-3xl mt-5">
      <h3 className="form-section-header">Documents & CNIC Images</h3>
      <p className="text-xs text-slate-400 mb-4 -mt-2">
        Upload CNIC images and other documents. They are stored securely in Firebase Storage.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <UploadField
          label="Customer CNIC Front"
          fieldKey="cnic-front"
          existingUrl={documents.cnicFront}
          customerId={customerId}
          onUploaded={url => onDocumentChange('cnicFront', url)}
        />
        <UploadField
          label="Customer CNIC Back"
          fieldKey="cnic-back"
          existingUrl={documents.cnicBack}
          customerId={customerId}
          onUploaded={url => onDocumentChange('cnicBack', url)}
        />
        <UploadField
          label="Customer Photo"
          fieldKey="photo"
          existingUrl={documents.customerPhoto}
          customerId={customerId}
          onUploaded={url => onDocumentChange('customerPhoto', url)}
        />
        <UploadField
          label="Nominee CNIC Front"
          fieldKey="nominee-cnic-front"
          existingUrl={documents.nomineeCnicFront}
          customerId={customerId}
          onUploaded={url => onDocumentChange('nomineeCnicFront', url)}
        />
        <UploadField
          label="Nominee CNIC Back"
          fieldKey="nominee-cnic-back"
          existingUrl={documents.nomineeCnicBack}
          customerId={customerId}
          onUploaded={url => onDocumentChange('nomineeCnicBack', url)}
        />
      </div>
    </div>
  );
};

export default DocumentUploads;
