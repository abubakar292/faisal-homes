import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Lock, Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react';
import gsap from 'gsap';
import Logo from '../components/Logo';
import toast from 'react-hot-toast';
import OtpVerificationStep from '../components/auth/OtpVerificationStep';
import { sendEmailOtp, verifyEmailOtp } from '../services/emailOtpService';
import { getDocument } from '../firebase/firestore';
import type { AppUser } from '../types';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'success'>('idle');
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [unverifiedUid, setUnverifiedUid] = useState<string>('');
  
  const { login, loginWithGoogle, markEmailVerified } = useAuth();
  const navigate = useNavigate();

  const containerRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const shapesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tl = gsap.timeline();
    tl.fromTo(leftPanelRef.current, { x: '-100%', opacity: 0 }, { x: '0%', opacity: 1, duration: 0.8, ease: 'power3.out' })
      .fromTo(rightPanelRef.current, { x: '50%', opacity: 0 }, { x: '0%', opacity: 1, duration: 0.8, ease: 'power3.out' }, '-=0.6')
      .fromTo('.stagger-item', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.1, ease: 'power2.out' }, '-=0.4');

    // Floating shapes animation
    if (shapesRef.current) {
      const shapes = shapesRef.current.children;
      gsap.to(shapes, {
        y: 'random(-30, 30)',
        x: 'random(-30, 30)',
        rotation: 'random(-15, 15)',
        duration: 4,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        stagger: {
          amount: 2,
          from: 'random'
        }
      });
    }
  }, []);

  const shakeForm = () => {
    gsap.fromTo(formRef.current, 
      { x: -10 }, 
      { x: 10, duration: 0.1, yoyo: true, repeat: 5, ease: 'power1.inOut', onComplete: () => gsap.set(formRef.current, { x: 0 }) }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields');
      shakeForm();
      return;
    }

    try {
      setError('');
      setLoadingState('loading');
      const user = await login(email, password);

      // Check if user has verified their email on initial setup
      const userData = await getDocument<AppUser>('users', user.uid);
      if (userData && userData.isEmailVerified === false) {
        // First-time unverified user: send OTP and switch to OTP step
        const otpRes = await sendEmailOtp(email, user.uid);
        setUnverifiedUid(user.uid);
        if (!otpRes.success && otpRes.error) {
          toast.error(otpRes.error, { duration: 6000 });
        } else {
          toast.success(`Security code sent to ${email}`);
        }
        setLoadingState('idle');
        setStep('otp');
        return;
      }

      setLoadingState('success');
      setTimeout(() => navigate('/'), 600);
    } catch (err: any) {
      setLoadingState('idle');
      setError('Failed to log in. Please check your credentials.');
      shakeForm();
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setError('');
      await loginWithGoogle();
      navigate('/');
    } catch (err: any) {
      setError('Failed to sign in with Google.');
      shakeForm();
    }
  };

  if (step === 'otp') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 p-4">
        <OtpVerificationStep
          email={email}
          onVerify={async (code) => {
            const res = await verifyEmailOtp(unverifiedUid, code);
            if (res.success) {
              await markEmailVerified(unverifiedUid);
              setTimeout(() => navigate('/'), 600);
            }
            return res;
          }}
          onResend={async () => {
            return await sendEmailOtp(email, unverifiedUid);
          }}
          onBack={() => setStep('form')}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="min-h-[100dvh] flex bg-slate-50 overflow-hidden">
      {/* Left Panel - Branding */}
      <div 
        ref={leftPanelRef}
        className="hidden lg:flex lg:w-1/2 relative flex-col justify-center items-center text-white p-12 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a3c6e 0%, #0d2346 100%)' }}
      >
        <div ref={shapesRef} className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-white rounded-full mix-blend-overlay filter blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-400 rounded-full mix-blend-overlay filter blur-3xl" />
          <div className="absolute top-1/2 left-1/2 w-72 h-72 bg-indigo-300 rounded-full mix-blend-overlay filter blur-3xl" />
        </div>

        <div className="relative z-10 text-center flex flex-col items-center">
          <div className="mb-6 transform transition-transform hover:scale-105 duration-500">
            <Logo size={80} variant="dark" />
          </div>
          <h1 className="text-5xl font-bold mb-4 tracking-tight">Faisal Homes</h1>
          <p className="text-xl text-blue-100 max-w-md font-light leading-relaxed">
            The premier management system for plotting, sales, and installments.
          </p>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div 
        ref={rightPanelRef}
        className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8 lg:p-12"
      >
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-5 sm:p-8 border border-slate-100">
          <div className="lg:hidden mb-8 flex justify-center">
             <div className="p-3 bg-[#1a3c6e] rounded-2xl">
               <Logo size={40} variant="dark" />
             </div>
          </div>
          
          <div className="mb-10 text-center lg:text-left stagger-item">
            <h2 className="text-3xl font-bold text-slate-800 mb-2">Welcome Back</h2>
            <p className="text-slate-500">Sign in to continue to your dashboard.</p>
          </div>

          <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-5">
              {/* Email Field */}
              <div className="relative stagger-item">
                <div className={`absolute inset-0 rounded-xl transition-all duration-300 pointer-events-none ${focusedField === 'email' ? 'ring-2 ring-blue-500/30 bg-blue-50/50' : 'bg-slate-50'}`} />
                <div className="relative flex items-center px-4 py-3 border border-slate-200 rounded-xl bg-transparent z-10 focus-within:border-blue-500 transition-colors">
                  <Mail className={`w-5 h-5 mr-3 transition-colors ${focusedField === 'email' ? 'text-blue-600' : 'text-slate-400'}`} />
                  <div className="flex-1 relative">
                    <input
                      type="email"
                      className="w-full bg-transparent outline-none text-slate-800 pt-3 pb-1 peer"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                      required
                    />
                    <label className={`absolute left-0 transition-all duration-300 pointer-events-none text-slate-500 font-medium ${email || focusedField === 'email' ? 'text-xs -top-1 text-blue-600' : 'text-base top-2'}`}>
                      Email Address
                    </label>
                  </div>
                </div>
              </div>

              {/* Password Field */}
              <div className="relative stagger-item">
                <div className={`absolute inset-0 rounded-xl transition-all duration-300 pointer-events-none ${focusedField === 'password' ? 'ring-2 ring-blue-500/30 bg-blue-50/50' : 'bg-slate-50'}`} />
                <div className="relative flex items-center px-4 py-3 border border-slate-200 rounded-xl bg-transparent z-10 focus-within:border-blue-500 transition-colors">
                  <Lock className={`w-5 h-5 mr-3 transition-colors ${focusedField === 'password' ? 'text-blue-600' : 'text-slate-400'}`} />
                  <div className="flex-1 relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="w-full bg-transparent outline-none text-slate-800 pt-3 pb-1 peer"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      required
                    />
                    <label className={`absolute left-0 transition-all duration-300 pointer-events-none text-slate-500 font-medium ${password || focusedField === 'password' ? 'text-xs -top-1 text-blue-600' : 'text-base top-2'}`}>
                      Password
                    </label>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1 text-slate-400 hover:text-slate-600 transition-colors ml-2"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div className="stagger-item text-sm text-red-500 bg-red-50 border border-red-100 p-3 rounded-lg flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loadingState !== 'idle'}
              className="stagger-item w-full py-3.5 rounded-xl text-white font-bold text-lg shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-70 disabled:hover:translate-y-0 relative overflow-hidden group"
              style={{ background: 'linear-gradient(to right, #1a3c6e, #2a5a9e)' }}
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              <div className="relative flex items-center justify-center">
                {loadingState === 'idle' && 'Sign In'}
                {loadingState === 'loading' && <Loader2 className="w-6 h-6 animate-spin" />}
                {loadingState === 'success' && <CheckCircle className="w-6 h-6 animate-bounce" />}
              </div>
            </button>
          </form>

          <div className="mt-8 stagger-item">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-slate-500">Or continue with</span>
              </div>
            </div>

            <button
              onClick={handleGoogleSignIn}
              type="button"
              className="mt-6 w-full flex items-center justify-center px-4 py-3 border border-slate-200 rounded-xl shadow-sm bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200"
            >
              <svg className="h-5 w-5 mr-3" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign in with Google
            </button>
          </div>

          <p className="mt-8 text-center text-sm text-slate-500 stagger-item">
            Don't have an account?{' '}
            <Link to="/register" className="font-semibold text-[#1a3c6e] hover:text-blue-700 transition-colors">
              Create one now
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
