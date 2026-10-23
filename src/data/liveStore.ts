import { useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import { subscribeCollection } from '../firebase/firestore';

export type SubscribeFn = <T>(
  collectionName: string,
  callback: (data: T[]) => void,
  constraints?: any[],
  onError?: (err: Error) => void
) => () => void;

let activeSubscribeFn: SubscribeFn = subscribeCollection;

export function setSubscribeCollectionFn(fn: SubscribeFn): void {
  activeSubscribeFn = fn;
}

export function resetSubscribeCollectionFn(): void {
  activeSubscribeFn = subscribeCollection;
}

interface CollectionState<T = any> {
  data: T[];
  loading: boolean;
  error: Error | null;
  version: number;
}

interface CollectionEntry<T = any> {
  name: string;
  state: CollectionState<T>;
  subscribers: Set<() => void>;
  unsubscribeFirestore: (() => void) | null;
  graceTimer: any | null;
  refCount: number;
}

const entries = new Map<string, CollectionEntry>();

// Listeners for global store status (number of active collections, online status)
const statusListeners = new Set<() => void>();

function notifyStatus(): void {
  for (const listener of statusListeners) {
    listener();
  }
}

function getOrCreateEntry<T>(name: string): CollectionEntry<T> {
  let entry = entries.get(name);
  if (!entry) {
    entry = {
      name,
      state: {
        data: [],
        loading: true,
        error: null,
        version: 0,
      },
      subscribers: new Set(),
      unsubscribeFirestore: null,
      graceTimer: null,
      refCount: 0,
    };
    entries.set(name, entry);
  }
  return entry;
}

export function getActiveListenerCount(): number {
  let count = 0;
  for (const entry of entries.values()) {
    if (entry.unsubscribeFirestore !== null) {
      count++;
    }
  }
  return count;
}

export function subscribeToCollection<T>(
  name: string,
  onStoreChange: () => void
): () => void {
  const entry = getOrCreateEntry<T>(name);
  entry.subscribers.add(onStoreChange);

  // If a grace timer was pending, cancel it since someone is subscribing
  if (entry.graceTimer) {
    clearTimeout(entry.graceTimer);
    entry.graceTimer = null;
  }

  entry.refCount++;

  // Start Firestore listener if not already running
  if (!entry.unsubscribeFirestore) {
    entry.unsubscribeFirestore = activeSubscribeFn<T>(
      name,
      (incomingData) => {
        entry.state = {
          data: incomingData,
          loading: false,
          error: null,
          version: entry.state.version + 1,
        };
        for (const sub of entry.subscribers) {
          sub();
        }
      },
      [],
      (err) => {
        entry.state = {
          ...entry.state,
          loading: false,
          error: err,
          version: entry.state.version + 1,
        };
        for (const sub of entry.subscribers) {
          sub();
        }
      }
    );
    notifyStatus();
  }

  // Return unsubscribe
  return () => {
    entry.subscribers.delete(onStoreChange);
    entry.refCount--;

    if (entry.refCount <= 0) {
      entry.refCount = 0;
      // Start 30-second grace timer
      if (!entry.graceTimer) {
        entry.graceTimer = setTimeout(() => {
          entry.graceTimer = null;
          if (entry.refCount === 0 && entry.unsubscribeFirestore) {
            entry.unsubscribeFirestore();
            entry.unsubscribeFirestore = null;
            notifyStatus();
          }
        }, 30000);
      }
    }
  };
}

export function getCollectionSnapshot<T>(name: string): CollectionState<T> {
  const entry = getOrCreateEntry<T>(name);
  return entry.state;
}

export type WhereFilter<T> =
  | ((item: T) => boolean)
  | [keyof T & string, string, any]
  | Partial<Record<keyof T & string, any>>;

export interface UseLiveCollectionOptions<T> {
  where?: WhereFilter<T>;
}

export interface LiveCollectionResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
}

export interface LiveDocumentResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export function useLiveCollection<T = any>(
  collectionName: string,
  options?: UseLiveCollectionOptions<T>
): LiveCollectionResult<T> {
  const subscribe = useMemo(() => {
    return (callback: () => void) => subscribeToCollection<T>(collectionName, callback);
  }, [collectionName]);

  const getSnapshot = useMemo(() => {
    return () => getCollectionSnapshot<T>(collectionName);
  }, [collectionName]);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const filteredData = useMemo(() => {
    if (!options?.where || !Array.isArray(state.data)) return state.data;
    const filter = options.where;

    if (typeof filter === 'function') {
      return state.data.filter(filter);
    }

    if (Array.isArray(filter)) {
      const [field, op, val] = filter;
      return state.data.filter((item: any) => {
        const itemVal = item[field];
        if (op === '==' || op === '===') return itemVal === val;
        if (op === '!=') return itemVal !== val;
        if (op === '>') return itemVal > val;
        if (op === '>=') return itemVal >= val;
        if (op === '<') return itemVal < val;
        if (op === '<=') return itemVal <= val;
        if (op === 'in') return Array.isArray(val) && val.includes(itemVal);
        return true;
      });
    }

    if (typeof filter === 'object') {
      const entriesList = Object.entries(filter);
      return state.data.filter((item: any) =>
        entriesList.every(([k, v]) => item[k] === v)
      );
    }

    return state.data;
  }, [state.data, state.version, options?.where]);

  return {
    data: filteredData,
    loading: state.loading,
    error: state.error,
  };
}

export function useLiveDocument<T = any>(
  collectionName: string,
  id: string | null | undefined
): LiveDocumentResult<T> {
  const { data, loading, error } = useLiveCollection<T>(collectionName);

  const doc = useMemo(() => {
    if (!id || !Array.isArray(data)) return null;
    return (data.find((item: any) => item.id === id) as T) || null;
  }, [data, id]);

  return {
    data: doc,
    loading: id ? loading : false,
    error,
  };
}

export interface LiveStatus {
  isOnline: boolean;
  activeListenersCount: number;
  isLive: boolean;
}

export function useLiveStatus(): LiveStatus {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine;
    }
    return true;
  });

  const [activeCount, setActiveCount] = useState<number>(() => getActiveListenerCount());

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleStatus = () => {
      setActiveCount(getActiveListenerCount());
    };
    statusListeners.add(handleStatus);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      statusListeners.delete(handleStatus);
    };
  }, []);

  return {
    isOnline,
    activeListenersCount: activeCount,
    isLive: isOnline && activeCount > 0,
  };
}
