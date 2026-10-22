import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';

export interface OpeningContextType {
  isConfigured: boolean | null;
  isUnlocked: boolean;
  token: string | null;
  serverError: boolean;
  isLoading: boolean;
  retryStatus: () => Promise<void>;
  lockNow: () => void;
  autoLockMinutes: number;
  setAutoLockMinutes: (mins: number) => void;
  onUnlocked: (token: string, exp: number) => void;
  setIsConfigured: (val: boolean) => void;
  changePin: (currentPin: string, newPin: string, confirm: string) => Promise<{ ok: boolean; error?: string }>;
}

const OpeningContext = createContext<OpeningContextType | null>(null);

export const useOpening = () => {
  const ctx = useContext(OpeningContext);
  if (!ctx) {
    throw new Error('useOpening must be used within an OpeningProvider');
  }
  return ctx;
};

const STORAGE_KEY_TOKEN = 'fh_opening_token';
const STORAGE_KEY_EXP = 'fh_opening_token_exp';
const STORAGE_KEY_AUTOLOCK = 'fh_opening_autolock_mins';

export const OpeningProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [serverError, setServerError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [autoLockMinutes, setAutoLockMinutesState] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_AUTOLOCK);
      if (stored !== null) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed)) return parsed;
      }
    } catch {}
    return 30; // default 30 minutes
  });

  const setAutoLockMinutes = (mins: number) => {
    setAutoLockMinutesState(mins);
    try {
      localStorage.setItem(STORAGE_KEY_AUTOLOCK, String(mins));
    } catch {}
  };

  const lastActivityRef = useRef<number>(Date.now());

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const lockNow = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY_TOKEN);
      sessionStorage.removeItem(STORAGE_KEY_EXP);
    } catch {}
    setToken(null);
    setIsUnlocked(false);
  }, []);

  const onUnlocked = useCallback((newToken: string, exp: number) => {
    try {
      sessionStorage.setItem(STORAGE_KEY_TOKEN, newToken);
      sessionStorage.setItem(STORAGE_KEY_EXP, String(exp));
    } catch {}
    setToken(newToken);
    setIsUnlocked(true);
    resetActivity();
  }, [resetActivity]);

  const verifySavedToken = async (existingToken: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/opening/check-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${existingToken}`,
        },
        body: JSON.stringify({ token: existingToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      return Boolean(data.valid);
    } catch {
      return false;
    }
  };

  const checkStatusAndToken = useCallback(async () => {
    setIsLoading(true);
    setServerError(false);

    try {
      const statusRes = await fetch('/api/opening/status', {
        method: 'GET',
        headers: { 'Cache-Control': 'no-store' },
      });

      if (!statusRes.ok) {
        throw new Error('Server returned ' + statusRes.status);
      }

      const statusData = await statusRes.json();
      const configured = Boolean(statusData.configured);
      setIsConfigured(configured);

      if (!configured) {
        // App is not configured; gate will show first-time setup
        setIsUnlocked(false);
        setIsLoading(false);
        return;
      }

      // App is configured; check session token
      let savedToken: string | null = null;
      let savedExp: string | null = null;
      try {
        savedToken = sessionStorage.getItem(STORAGE_KEY_TOKEN);
        savedExp = sessionStorage.getItem(STORAGE_KEY_EXP);
      } catch {}

      if (savedToken && savedExp && Number(savedExp) > Date.now()) {
        const isValid = await verifySavedToken(savedToken);
        if (isValid) {
          setToken(savedToken);
          setIsUnlocked(true);
          resetActivity();
          setIsLoading(false);
          return;
        }
      }

      // No valid token in sessionStorage
      lockNow();
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to connect to opening password server:', err);
      setServerError(true);
      setIsLoading(false);
    }
  }, [lockNow, resetActivity]);

  useEffect(() => {
    checkStatusAndToken();
  }, [checkStatusAndToken]);

  // Idle lock listener
  useEffect(() => {
    if (!isUnlocked || autoLockMinutes <= 0) return;

    const onUserActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, onUserActivity, { passive: true }));

    const checkInterval = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      const thresholdMs = autoLockMinutes * 60 * 1000;
      if (idleMs >= thresholdMs) {
        lockNow();
        toast('App locked due to inactivity');
      }
    }, 5000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, onUserActivity));
      clearInterval(checkInterval);
    };
  }, [isUnlocked, autoLockMinutes, lockNow]);

  const changePin = async (
    currentPin: string,
    newPin: string,
    confirm: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!token) {
      return { ok: false, error: 'Valid session token required' };
    }

    try {
      const res = await fetch('/api/opening/change', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPin, newPin, confirm, token }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || 'Failed to change opening password' };
      }

      if (data.token && data.exp) {
        onUnlocked(data.token, data.exp);
      }

      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: 'Network error while changing opening password' };
    }
  };

  return (
    <OpeningContext.Provider
      value={{
        isConfigured,
        isUnlocked,
        token,
        serverError,
        isLoading,
        retryStatus: checkStatusAndToken,
        lockNow,
        autoLockMinutes,
        setAutoLockMinutes,
        onUnlocked,
        setIsConfigured,
        changePin,
      }}
    >
      {children}
    </OpeningContext.Provider>
  );
};
