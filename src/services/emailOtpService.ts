import emailjs from '@emailjs/browser';
import { getDocument, setDocument, updateDocument } from '../firebase/firestore';

export interface OtpRecord {
  id?: string;
  userId: string;
  email: string;
  code: string;
  createdAt: Date;
  expiresAt: Date;
  attempts: number;
  verified: boolean;
}

export function generateSecureOtp(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    const code = 100000 + (array[0] % 900000);
    return code.toString();
  }
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendEmailOtp(
  email: string,
  userId: string
): Promise<{ success: boolean; message: string; error?: string }> {
  const code = generateSecureOtp();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes validity

  const otpData: OtpRecord = {
    userId,
    email: email.trim().toLowerCase(),
    code,
    createdAt: now,
    expiresAt,
    attempts: 0,
    verified: false,
  };

  // Save to Firestore
  await setDocument('otp_verifications', userId, otpData);

  // EmailJS configuration
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

  if (serviceId && templateId && publicKey) {
    try {
      await emailjs.send(
        serviceId,
        templateId,
        {
          to_email: email,
          email: email,
          user_email: email,
          recipient: email,
          to_name: email.split('@')[0],
          otp_code: code,
          passcode: code,
          code: code,
          otp: code,
          app_name: 'Faisal Homes',
          expiry_minutes: '10',
        },
        publicKey
      );
      return { success: true, message: `Security code sent to ${email}` };
    } catch (err: any) {
      console.error('EmailJS send error:', err);
      const detail = err?.text || err?.message || 'Failed to dispatch email';
      return {
        success: false,
        message: detail,
        error: `Email delivery error: ${detail}. Please check your Template ID in EmailJS dashboard.`,
      };
    }
  }

  // Warning when keys are not configured
  console.warn('[Faisal Homes Auth] EmailJS environment variables are missing in .env');
  return {
    success: false,
    message: 'Email service is not configured.',
    error: 'EmailJS credentials not found. Please ensure VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, and VITE_EMAILJS_PUBLIC_KEY are set in your .env file and restart Vite dev server.',
  };
}

export async function verifyEmailOtp(
  userId: string,
  enteredCode: string
): Promise<{ success: boolean; error?: string }> {
  const trimmed = enteredCode.trim();
  if (trimmed.length !== 6) {
    return { success: false, error: 'Please enter all 6 digits of your security code.' };
  }

  const record = await getDocument<OtpRecord>('otp_verifications', userId);
  if (!record) {
    return { success: false, error: 'No verification request found. Please request a new code.' };
  }

  if (record.verified) {
    return { success: true };
  }

  const now = new Date();
  const expiresAt = record.expiresAt instanceof Date ? record.expiresAt : new Date(record.expiresAt);
  if (now.getTime() > expiresAt.getTime()) {
    return { success: false, error: 'Security code has expired. Please click Resend Code.' };
  }

  if ((record.attempts || 0) >= 5) {
    return {
      success: false,
      error: 'Too many incorrect attempts. Please request a new security code.',
    };
  }

  if (record.code !== trimmed) {
    await updateDocument('otp_verifications', userId, {
      attempts: (record.attempts || 0) + 1,
    });
    return {
      success: false,
      error: 'Invalid security code. Please check your email and try again.',
    };
  }

  // Mark OTP verified
  await updateDocument('otp_verifications', userId, {
    verified: true,
  });

  // Mark user profile as email verified
  await updateDocument('users', userId, {
    isEmailVerified: true,
    emailVerifiedAt: new Date(),
  });

  return { success: true };
}
