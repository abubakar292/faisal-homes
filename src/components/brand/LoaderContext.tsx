import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';

interface LoaderContextType {
  active: boolean;
  activeSince: number;
  begin: () => void;
  end: () => void;
}

const LoaderContext = createContext<LoaderContextType>({
  active: false,
  activeSince: 0,
  begin: () => {},
  end: () => {}
});

export const LoaderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [count, setCount] = useState(0);
  const [activeSince, setActiveSince] = useState(0);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const begin = useCallback(() => {
    setCount(c => {
      if (c === 0) setActiveSince(Date.now());
      return c + 1;
    });
  }, []);

  const end = useCallback(() => {
    setCount(c => Math.max(0, c - 1));
  }, []);

  useEffect(() => {
    if (count > 0) {
      safetyTimer.current = setTimeout(() => {
        setCount(0);
        toast('This is taking longer than usual');
      }, 15000);
    } else {
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
    }
    return () => {
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
    };
  }, [count]);

  const value = useMemo(() => ({
    active: count > 0,
    activeSince,
    begin,
    end
  }), [count, activeSince, begin, end]);

  return (
    <LoaderContext.Provider value={value}>
      {children}
    </LoaderContext.Provider>
  );
};

export const useLoader = () => useContext(LoaderContext);

export const PageLoading: React.FC = () => {
  const { begin, end } = useLoader();
  useEffect(() => {
    begin();
    return () => end();
  }, [begin, end]);
  return null;
};
