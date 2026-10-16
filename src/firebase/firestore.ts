import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  setDoc,
  QueryConstraint,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

// ─── Generic CRUD helpers ─────────────────────────────────────────────────────

export const getCollection = async <T>(collectionName: string, constraints: QueryConstraint[] = []) => {
  const ref = collection(db, collectionName);
  const q = constraints.length ? query(ref, ...constraints) : query(ref);
  const snap = await getDocs(q);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return snap.docs.map((d: any) => ({ id: d.id, ...convertTimestamps(d.data()) })) as T[];
};

export const getDocument = async <T>(collectionName: string, docId: string) => {
  const ref = doc(db, collectionName, docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...convertTimestamps(snap.data()) } as T;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const addDocument = async <T extends Record<string, any>>(collectionName: string, data: T) => {
  const ref = collection(db, collectionName);
  const docRef = await addDoc(ref, { ...prepareForFirestore(data), createdAt: serverTimestamp() });
  return docRef.id;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const updateDocument = async <T extends Record<string, any>>(collectionName: string, docId: string, data: Partial<T>) => {
  const ref = doc(db, collectionName, docId);
  await updateDoc(ref, prepareForFirestore(data) as Record<string, unknown>);
};

export const deleteDocument = async (collectionName: string, docId: string) => {
  const ref = doc(db, collectionName, docId);
  await deleteDoc(ref);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setDocument = async <T extends Record<string, any>>(collectionName: string, docId: string, data: T) => {
  const ref = doc(db, collectionName, docId);
  await setDoc(ref, { ...prepareForFirestore(data) }, { merge: true });
};

export const subscribeCollection = <T>(
  collectionName: string,
  callback: (data: T[]) => void,
  constraints: QueryConstraint[] = []
) => {
  const ref = collection(db, collectionName);
  const q = constraints.length ? query(ref, ...constraints) : query(ref);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return onSnapshot(q, (snap: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = snap.docs.map((d: any) => ({ id: d.id, ...convertTimestamps(d.data()) })) as T[];
    callback(data);
  });
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function convertTimestamps(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Timestamp) {
      result[key] = value.toDate();
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = convertTimestamps(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prepareForFirestore(data: Record<string, any>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Date) {
      result[key] = Timestamp.fromDate(value);
    } else if (value === undefined) {
      result[key] = null;
    } else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Timestamp)) {
      result[key] = prepareForFirestore(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ─── Re-export query helpers ──────────────────────────────────────────────────

export { where, orderBy, collection, doc, query, getDocs, getDoc, onSnapshot };
