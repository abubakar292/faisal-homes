import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';
import Logo from '../Logo';
import { useOpening } from '../../contexts/OpeningContext';

export const OpeningGate: React.FC = () => {
  const {
    isConfigured,
    isUnlocked,
    serverError,
    retryStatus,
    onUnlocked,
    setIsConfigured,
  } = useOpening();

  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();

  // Mode: 'verify' | 'setup-step1' | 'setup-step2'
  const [setupStep, setSetupStep] = useState<'step1' | 'step2'>('step1');
  const [setupPin, setSetupPin] = useState('');

  // 4 digits array
  const [digits, setDigits] = useState<string[]>(['', '', '', '']);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // UI state
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  // Rate limiting lockout
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [totalLockSeconds, setTotalLockSeconds] = useState<number>(900);

  // Focus the first input on mount or step change
  useEffect(() => {
    if (!isUnlocked && !lockedUntil && !serverError) {
      setTimeout(() => {
        inputsRef.current[0]?.focus();
      }, 100);
    }
  }, [isUnlocked, setupStep, isConfigured, lockedUntil, serverError]);

  // Lockout countdown timer
  useEffect(() => {
    if (!lockedUntil) {
      setSecondsRemaining(0);
      return;
    }

    const updateTimer = () => {
      const diff = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (diff <= 0) {
        setLockedUntil(null);
        setSecondsRemaining(0);
        setErrorMessage('');
      } else {
        setSecondsRemaining(diff);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const triggerShake = (msg: string) => {
    setErrorMessage(msg);
    setIsShaking(true);
    setTimeout(() => {
      setIsShaking(false);
    }, 600);
  };

  const clearInputs = () => {
    setDigits(['', '', '', '']);
    inputsRef.current[0]?.focus();
  };

  const handleDigitChange = (index: number, value: string) => {
    if (lockedUntil || isSubmitting || isSuccess) return;

    // Sanitize to only numeric character
    const cleaned = value.replace(/\D/g, '');
    if (!cleaned) {
      const newDigits = [...digits];
      newDigits[index] = '';
      setDigits(newDigits);
      return;
    }

    const lastChar = cleaned.slice(-1);
    const newDigits = [...digits];
    newDigits[index] = lastChar;
    setDigits(newDigits);

    // Auto-advance
    if (index < 3) {
      inputsRef.current[index + 1]?.focus();
    } else {
      // 4th digit entered - trigger auto-submit
      const fullPin = newDigits.join('');
      if (fullPin.length === 4) {
        handleCompletePin(fullPin);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        setDigits(newDigits);
        inputsRef.current[index - 1]?.focus();
      } else {
        const newDigits = [...digits];
        newDigits[index] = '';
        setDigits(newDigits);
      }
    } else if (e.key === 'Enter') {
      const fullPin = digits.join('');
      if (fullPin.length === 4) {
        handleCompletePin(fullPin);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (lockedUntil || isSubmitting || isSuccess) return;

    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pasted.length === 4) {
      const newDigits = pasted.split('');
      setDigits(newDigits);
      inputsRef.current[3]?.focus();
      handleCompletePin(pasted);
    }
  };

  const handleCompletePin = async (pin: string) => {
    if (isSubmitting || lockedUntil) return;

    // If first-time configuration flow
    if (isConfigured === false) {
      if (setupStep === 'step1') {
        setSetupPin(pin);
        setDigits(['', '', '', '']);
        setSetupStep('step2');
        setErrorMessage('');
        setTimeout(() => inputsRef.current[0]?.focus(), 50);
        return;
      }

      // Step 2: Confirm PIN
      if (pin !== setupPin) {
        triggerShake('PINs do not match. Please try again.');
        setDigits(['', '', '', '']);
        setSetupStep('step1');
        setSetupPin('');
        setTimeout(() => inputsRef.current[0]?.focus(), 50);
        return;
      }

      // Submit setup to server
      setIsSubmitting(true);
      try {
        const setupRes = await fetch('/api/opening/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, confirm: pin }),
        });
        const setupData = await setupRes.json();

        if (!setupRes.ok || !setupData.ok || !setupData.token) {
          triggerShake(setupData.error || 'Failed to save opening password');
          clearInputs();
          setSetupStep('step1');
          setSetupPin('');
          setIsSubmitting(false);
          return;
        }

        setIsSuccess(true);
        setIsConfigured(true);
        onUnlocked(setupData.token, setupData.exp);
        setTimeout(() => {
          navigate('/login');
        }, 500);
      } catch {
        triggerShake('Network error. Could not connect to server.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Configured flow: Verify PIN
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/opening/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();

      if (res.status === 429 && data.lockedUntilMs) {
        const waitSecs = Math.max(1, Math.ceil((data.lockedUntilMs - Date.now()) / 1000));
        setTotalLockSeconds(waitSecs);
        setLockedUntil(data.lockedUntilMs);
        triggerShake(data.error || 'Too many failed attempts. Verification locked.');
        clearInputs();
        setIsSubmitting(false);
        return;
      }

      if (!res.ok || !data.ok) {
        const msg = data.remainingAttempts
          ? `Incorrect PIN. ${data.remainingAttempts} attempts remaining.`
          : data.error || 'Incorrect opening password.';
        triggerShake(msg);
        clearInputs();
        setIsSubmitting(false);
        return;
      }

      // Success
      setIsSuccess(true);
      onUnlocked(data.token, data.exp);
      setTimeout(() => {
        navigate('/login');
      }, 500);
    } catch {
      triggerShake('Network error. Unable to verify PIN.');
      clearInputs();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isUnlocked) {
    return null;
  }

  // Format MM:SS for lockout countdown
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // SVG circular countdown calculations
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = totalLockSeconds > 0
    ? circumference * (1 - (secondsRemaining / totalLockSeconds))
    : 0;

  return (
    <div
      id="opening-security-gate"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto select-none"
      style={{
        background: 'radial-gradient(ellipse at top, #1a3c6e 0%, #0d2346 100%)',
      }}
    >
      <div className="w-full max-w-md mx-auto text-center px-4 py-8 sm:p-8">
        {/* Brand Mark */}
        <div className="flex justify-center mb-6">
          <div className="p-3.5 bg-white/10 rounded-2xl backdrop-blur-md border border-white/20 shadow-2xl transition-transform hover:scale-105">
            <Logo size={56} variant="dark" />
          </div>
        </div>

        {/* Server Connection Error View */}
        {serverError ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-red-500/30 text-white"
          >
            <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
            <h2 className="text-xl font-bold mb-2">Connection Error</h2>
            <p className="text-white/80 text-sm mb-6 leading-relaxed">
              Unable to reach the security verification service. Please check your network connection.
            </p>
            <button
              onClick={retryStatus}
              className="w-full py-3 px-6 rounded-xl font-bold text-sm tracking-wide bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-900 shadow-lg flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <RefreshCw className="w-4 h-4" />
              Retry Connection
            </button>
          </motion.div>
        ) : (
          <div>
            {/* Header Title */}
            <div className="mb-8">
              {isConfigured === false ? (
                <>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2">
                    Set your Opening Password
                  </h1>
                  <p className="text-amber-300 text-sm font-medium">
                    {setupStep === 'step1'
                      ? 'Step 1: Choose a 4-digit security PIN'
                      : 'Step 2: Confirm your 4-digit security PIN'}
                  </p>
                </>
              ) : (
                <>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white/90 text-xs font-semibold mb-3 border border-white/15">
                    <Shield className="w-3.5 h-3.5 text-amber-400" />
                    <span>Security Verification</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2">
                    Enter Opening Password
                  </h1>
                  <p className="text-white/70 text-sm">
                    Enter your 4-digit PIN to access Faisal Homes
                  </p>
                </>
              )}
            </div>

            {/* Rate-limit Lockout Countdown UI */}
            {lockedUntil && secondsRemaining > 0 ? (
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-red-500/30 text-white mb-6">
                <div className="relative w-28 h-28 mx-auto mb-4 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 96 96">
                    <circle
                      cx="48"
                      cy="48"
                      r={radius}
                      className="text-white/20"
                      strokeWidth="6"
                      stroke="currentColor"
                      fill="transparent"
                    />
                    <circle
                      cx="48"
                      cy="48"
                      r={radius}
                      className="text-amber-400 transition-all duration-1000 ease-linear"
                      strokeWidth="6"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="transparent"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <Lock className="w-5 h-5 text-amber-400 mb-0.5" />
                    <span className="text-sm font-mono font-bold tracking-wider text-white">
                      {formatTime(secondsRemaining)}
                    </span>
                  </div>
                </div>

                <p className="text-amber-200 text-sm font-medium">
                  Verification is temporarily locked
                </p>
                <p className="text-white/60 text-xs mt-1">
                  Please wait until the countdown ends before trying again.
                </p>
              </div>
            ) : (
              /* 4-Digit Input Form */
              <motion.div
                animate={
                  isShaking && !shouldReduceMotion
                    ? { x: [-12, 12, -10, 10, -6, 6, 0] }
                    : {}
                }
                transition={{ duration: 0.5 }}
                className="mb-8"
              >
                <div className="flex justify-center gap-3 sm:gap-4 mb-6">
                  {[0, 1, 2, 3].map((index) => {
                    const isFilled = Boolean(digits[index]);
                    return (
                      <div key={index} className="relative">
                        <input
                          ref={(el) => { inputsRef.current[index] = el; }}
                          type="password"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={1}
                          disabled={isSubmitting || isSuccess || Boolean(lockedUntil)}
                          value={digits[index]}
                          onChange={(e) => handleDigitChange(index, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(index, e)}
                          onPaste={index === 0 ? handlePaste : undefined}
                          aria-label={`Digit ${index + 1} of 4`}
                          className={`w-14 h-16 sm:w-16 sm:h-20 text-center text-3xl font-extrabold rounded-2xl bg-white/10 text-transparent caret-transparent border-2 outline-none transition-all duration-200 select-none ${
                            isSuccess
                              ? 'border-emerald-400 bg-emerald-500/20'
                              : isFilled
                              ? 'border-amber-400 bg-white/20 shadow-lg shadow-amber-400/20'
                              : 'border-white/20 focus:border-amber-400 focus:bg-white/15'
                          } disabled:opacity-50`}
                        />
                        {/* Custom smooth filled dot indicator */}
                        {isFilled && !isSuccess && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                            className="absolute inset-0 flex items-center justify-center pointer-events-none"
                          >
                            <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-gradient-to-tr from-amber-400 to-amber-300 shadow-md shadow-amber-400/50" />
                          </motion.div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Status / Error Banner */}
                <AnimatePresence mode="wait">
                  {errorMessage && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="text-sm font-medium text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-xl px-4 py-2.5 max-w-xs mx-auto"
                    >
                      {errorMessage}
                    </motion.div>
                  )}
                  {isSuccess && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-sm font-bold text-emerald-300 flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      Opening Password Verified!
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* Back button during step 2 of setup */}
            {isConfigured === false && setupStep === 'step2' && (
              <button
                type="button"
                onClick={() => {
                  setSetupStep('step1');
                  setSetupPin('');
                  clearInputs();
                }}
                className="text-white/60 hover:text-white text-xs underline font-medium transition-colors"
              >
                Back to step 1
              </button>
            )}
          </div>
        )}

        {/* Security Note */}
        <p className="mt-8 text-white/40 text-xs">
          Protected by Faisal Homes Server Security &bull; PBKDF2-SHA256
        </p>
      </div>
    </div>
  );
};

export default OpeningGate;
