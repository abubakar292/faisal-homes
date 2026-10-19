import React, { createContext, useContext, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  User,
  updatePassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase/config';
import { getDocument, setDocument, updateDocument } from '../firebase/firestore';
import type { AppUser } from '../types';

interface AuthContextType {
  currentUser: User | null;
  appUser: AppUser | null;
  login: (email: string, password: string) => Promise<User>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
  isAdmin: boolean;
  createUser: (email: string, password: string, isVerified?: boolean) => Promise<string>;
  changePassword: (newPassword: string) => Promise<void>;
  markEmailVerified: (uid: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Handle redirect result if any
    getRedirectResult(auth).catch((err) => console.error('Redirect sign-in error:', err));

    const unsub = onAuthStateChanged(auth, async (user: User | null) => {
      setCurrentUser(user);
      if (user) {
        try {
          let userData = await getDocument<AppUser>('users', user.uid);
          const isGoogleUser = user.providerData.some((p) => p.providerId === 'google.com');

          // Auto-create profile for Google users signing in for the first time
          if (!userData) {
            const newUser: Omit<AppUser, 'id'> = {
              name: user.displayName || user.email?.split('@')[0] || 'User',
              email: user.email || '',
              role: 'admin',
              active: true,
              createdAt: new Date(),
              isEmailVerified: isGoogleUser, // Google verified accounts are trusted
              emailVerifiedAt: isGoogleUser ? new Date() : undefined,
            };
            await setDocument('users', user.uid, newUser);
            userData = { id: user.uid, ...newUser };
          } else {
            // Existing accounts created before OTP migration stay verified
            if (userData.isEmailVerified === undefined) {
              userData.isEmailVerified = true;
            }
          }

          if (userData && userData.active === false) {
            await signOut(auth);
            toast.error('Your account is deactivated');
            setAppUser(null);
            setCurrentUser(null);
            setLoading(false);
            return;
          }

          setAppUser(userData);
        } catch {
          setAppUser(null);
        }
      } else {
        setAppUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // --- Email / Password login -----------------------------------------------
  const login = async (email: string, password: string): Promise<User> => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  };

  // --- Google login ---------------------------------------------------------
  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
        await signInWithRedirect(auth, googleProvider);
      } else {
        throw error;
      }
    }
  };

  // --- Sign out -------------------------------------------------------------
  const logout = async () => {
    await signOut(auth);
  };

  // --- Create user ----------------------------------------------------------
  const createUser = async (
    email: string,
    password: string,
    isVerified: boolean = false
  ): Promise<string> => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;

    const newUser: Omit<AppUser, 'id'> = {
      name: email.split('@')[0] || 'User',
      email: email.trim().toLowerCase(),
      role: 'admin',
      active: true,
      createdAt: new Date(),
      isEmailVerified: isVerified,
      emailVerifiedAt: isVerified ? new Date() : undefined,
    };

    await setDocument('users', uid, newUser);
    return uid;
  };

  // --- Mark Email Verified --------------------------------------------------
  const markEmailVerified = async (uid: string) => {
    await updateDocument('users', uid, {
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    });
    setAppUser((prev) => (prev ? { ...prev, isEmailVerified: true, emailVerifiedAt: new Date() } : prev));
  };

  // --- Change password ------------------------------------------------------
  const changePassword = async (newPassword: string) => {
    if (!currentUser) throw new Error('Not authenticated');
    await updatePassword(currentUser, newPassword);
  };

  const isAdmin = appUser?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        appUser,
        login,
        loginWithGoogle,
        logout,
        loading,
        isAdmin,
        createUser,
        changePassword,
        markEmailVerified,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
