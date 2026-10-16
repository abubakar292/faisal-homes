import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Printer, X } from 'lucide-react';

interface PrintOption {
  label: string;
  onClick: () => void;
}

interface PrintPromptProps {
  show: boolean;
  title?: string;
  message?: string;
  options: PrintOption[];
  onClose: () => void;
}

const PrintPrompt: React.FC<PrintPromptProps> = ({
  show,
  title = 'Saved Successfully!',
  message = 'Would you like to print?',
  options,
  onClose,
}) => {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
          >
            {/* Header */}
            <div className="text-center px-6 pt-6 pb-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)' }}
              >
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <h3 className="font-bold text-lg text-slate-900">{title}</h3>
              <p className="text-sm text-slate-500 mt-1">{message}</p>
            </div>

            {/* Actions */}
            <div className="px-6 pb-6 space-y-2">
              {options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => { opt.onClick(); onClose(); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1a3c6e] hover:bg-[#0f2548] text-white rounded-xl text-sm font-semibold transition-all active:scale-[0.98]"
                >
                  <Printer size={15} />
                  {opt.label}
                </button>
              ))}
              <button
                onClick={onClose}
                className="w-full px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all active:scale-[0.98]"
              >
                Skip
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PrintPrompt;
