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
import { getDocument, setDocument } from '../firebase/firestore';
import type { AppUser } from '../types';

interface AuthContextType {
  currentUser: User | null;
  appUser: AppUser | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
  isAdmin: boolean;
  createUser: (email: string, password: string) => Promise<string>;
  changePassword: (newPassword: string) => Promise<void>;
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
    getRedirectResult(auth).catch(err => console.error('Redirect sign-in error:', err));

    const unsub = onAuthStateChanged(auth, async (user: User | null) => {
      setCurrentUser(user);
      if (user) {
        try {
          let userData = await getDocument<AppUser>('users', user.uid);
          // Auto-create profile for Google users signing in for the first time
          if (!userData) {
            const newUser: Omit<AppUser, 'id'> = {
              name: user.displayName || user.email?.split('@')[0] || 'User',
              email: user.email || '',
              role: 'admin',   // default role for new signups
              active: true,
              createdAt: new Date(),
            };
            await setDocument('users', user.uid, newUser);
            userData = { id: user.uid, ...newUser };
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

  // ── Email / Password login ────────────────────────────────────────────────
  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  // ── Google login ──────────────────────────────────────────────────────────
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

  // ── Sign out ──────────────────────────────────────────────────────────────
  const logout = async () => {
    await signOut(auth);
  };

  // ── Create user (admin panel) ─────────────────────────────────────────────
  const createUser = async (email: string, password: string): Promise<string> => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    return cred.user.uid;
  };

  // ── Change password ───────────────────────────────────────────────────────
  const changePassword = async (newPassword: string) => {
    if (!currentUser) throw new Error('Not authenticated');
    await updatePassword(currentUser, newPassword);
  };

  const isAdmin = appUser?.role === 'admin';

  return (
    <AuthContext.Provider value={{
      currentUser, appUser, login, loginWithGoogle, logout,
      loading, isAdmin, createUser, changePassword
    }}>
      {children}
    </AuthContext.Provider>
  );
};
