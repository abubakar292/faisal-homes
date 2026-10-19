import React, { useState, useEffect, useRef } from 'react';
import { Shield, ArrowLeft, Loader2, CheckCircle2, RotateCw } from 'lucide-react';
import toast from 'react-hot-toast';

interface OtpVerificationStepProps {
  email: string;
  onVerify: (code: string) => Promise<{ success: boolean; error?: string }>;
  onResend: () => Promise<{ success: boolean; message: string; error?: string }>;
  onBack: () => void;
}

export const OtpVerificationStep: React.FC<OtpVerificationStepProps> = ({
  email,
  onVerify,
  onResend,
  onBack,
}) => {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(60);
  const [resending, setResending] = useState(false);
  const [verifiedSuccess, setVerifiedSuccess] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-focus first input box on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // 60-second countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleDigitChange = (index: number, value: string) => {
    setError('');
    // Only accept numeric digit
    const cleaned = value.replace(/\D/g, '');
    const newDigits = [...digits];

    if (cleaned.length > 1) {
      // User pasted multiple characters into this box
      const chars = cleaned.slice(0, 6).split('');
      chars.forEach((c, idx) => {
        if (index + idx < 6) {
          newDigits[index + idx] = c;
        }
      });
      setDigits(newDigits);
      const nextFocus = Math.min(index + chars.length, 5);
      inputRefs.current[nextFocus]?.focus();
      return;
    }

    newDigits[index] = cleaned;
    setDigits(newDigits);

    if (cleaned && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const newDigits = [...digits];
    pasted.split('').forEach((c, idx) => {
      if (idx < 6) newDigits[idx] = c;
    });
    setDigits(newDigits);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullCode = digits.join('');
    if (fullCode.length !== 6) {
      setError('Please enter all 6 digits of your security code.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const res = await onVerify(fullCode);
      if (res.success) {
        setVerifiedSuccess(true);
        toast.success('Email verified successfully!');
      } else {
        setError(res.error || 'Invalid code. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendClick = async () => {
    if (countdown > 0 || resending) return;
    try {
      setResending(true);
      setError('');
      const res = await onResend();
      if (res.success) {
        toast.success(res.message || 'New security code sent to your email!');
        setCountdown(60);
      } else {
        setError(res.error || res.message || 'Failed to resend code.');
        toast.error(res.error || 'Failed to send security code');
      }
    } catch {
      toast.error('Failed to resend code. Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 sm:p-8 bg-white rounded-2xl shadow-xl border border-slate-100">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors mb-6 focus:outline-none"
      >
        <ArrowLeft size={14} /> Back
      </button>

      <div className="flex flex-col items-center text-center mb-6">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-sm"
          style={{ background: 'linear-gradient(135deg, #1a3c6e 0%, #0d2346 100%)' }}
        >
          {verifiedSuccess ? (
            <CheckCircle2 size={28} className="text-emerald-400 animate-bounce" />
          ) : (
            <Shield size={28} className="text-[#e7b861]" />
          )}
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
          Verify Your Email
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-2 max-w-sm">
          A one-time 6-digit security code has been sent to:
        </p>
        <span className="text-xs sm:text-sm font-bold text-[#1a3c6e] mt-1 break-all bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
          {email}
        </span>
      </div>

      {error && (
        <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs text-center font-medium animate-shake">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 6-digit boxes */}
        <div className="flex justify-center items-center gap-2 sm:gap-3" onPaste={handlePaste}>
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => {
                inputRefs.current[index] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              disabled={loading || verifiedSuccess}
              className={`w-11 h-13 sm:w-12 sm:h-14 text-center font-bold text-xl sm:text-2xl rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-[#e7b861] ${
                digit
                  ? 'border-[#1a3c6e] bg-blue-50/40 text-slate-900 shadow-sm'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
              } ${error ? 'border-red-400 bg-red-50/20' : ''}`}
            />
          ))}
        </div>

        {/* Submit Verify button */}
        <button
          type="submit"
          disabled={loading || verifiedSuccess || digits.join('').length !== 6}
          className="w-full py-3.5 px-4 rounded-xl font-bold text-sm tracking-wide text-white transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #1a3c6e 0%, #0d2346 100%)' }}
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin text-[#e7b861]" />
              <span>Verifying...</span>
            </>
          ) : verifiedSuccess ? (
            <>
              <CheckCircle2 size={18} className="text-emerald-400" />
              <span>Verified! Entering...</span>
            </>
          ) : (
            <span>Verify & Continue</span>
          )}
        </button>

        {/* Countdown & Resend */}
        <div className="text-center text-xs text-slate-500 pt-2">
          {countdown > 0 ? (
            <p>
              Didn't receive the code? Resend in{' '}
              <span className="font-bold text-slate-700">{countdown}s</span>
            </p>
          ) : (
            <button
              type="button"
              onClick={handleResendClick}
              disabled={resending}
              className="font-bold text-[#1a3c6e] hover:text-[#0d2346] transition-colors inline-flex items-center gap-1.5 focus:outline-none cursor-pointer"
            >
              {resending ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Sending code...</span>
                </>
              ) : (
                <>
                  <RotateCw size={13} />
                  <span>Resend Security Code</span>
                </>
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default OtpVerificationStep;
