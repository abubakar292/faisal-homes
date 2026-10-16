import React from 'react';

interface Props {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}

const FormField: React.FC<Props> = ({ label, required, error, hint, children }) => {
  return (
    <div className="space-y-1.5">
      <label className="label">
        {label}
        {required && <span className="text-red-500 ml-0.5 normal-case font-bold text-sm">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="text-[11px] text-slate-400 leading-tight">{hint}</p>
      )}
      {error && (
        <p className="text-[11px] text-red-500 font-medium leading-tight flex items-center gap-1">
          <span>⚠</span> {error}
        </p>
      )}
    </div>
  );
};

export default FormField;
