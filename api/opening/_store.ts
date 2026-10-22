import type { OpeningSecurityRecord } from './_crypto.js';

export interface ISecurityStore {
  get(): Promise<OpeningSecurityRecord | null>;
  createIfAbsent(record: OpeningSecurityRecord): Promise<boolean>;
  update(record: OpeningSecurityRecord): Promise<void>;
  deleteRecord?(): Promise<void>;
}

export class InMemorySecurityStore implements ISecurityStore {
  private currentRecord: OpeningSecurityRecord | null = null;

  async get(): Promise<OpeningSecurityRecord | null> {
    return this.currentRecord ? { ...this.currentRecord } : null;
  }

  async createIfAbsent(record: OpeningSecurityRecord): Promise<boolean> {
    if (this.currentRecord !== null) {
      return false;
    }
    this.currentRecord = { ...record };
    return true;
  }

  async update(record: OpeningSecurityRecord): Promise<void> {
    this.currentRecord = { ...record };
  }

  async deleteRecord(): Promise<void> {
    this.currentRecord = null;
  }
}

class FirestoreSecurityStore implements ISecurityStore {
  private firestoreInstance: any = null;

  private async getDb() {
    if (!this.firestoreInstance) {
      const { initializeApp, getApps, cert } = await import('firebase-admin/app');
      const { getFirestore } = await import('firebase-admin/firestore');

      if (getApps().length === 0) {
        const saB64 = process.env.FIREBASE_SERVICE_ACCOUNT;
        if (saB64) {
          try {
            const saJson = Buffer.from(saB64, 'base64').toString('utf8');
            const creds = JSON.parse(saJson);
            initializeApp({
              credential: cert(creds),
            });
          } catch (err) {
            console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', err);
            initializeApp();
          }
        } else {
          initializeApp();
        }
      }
      this.firestoreInstance = getFirestore();
    }
    return this.firestoreInstance;
  }

  private getDocRef(db: any) {
    return db.collection('app_security').doc('opening_pin');
  }

  async get(): Promise<OpeningSecurityRecord | null> {
    const db = await this.getDb();
    const snap = await this.getDocRef(db).get();
    if (!snap.exists) {
      return null;
    }
    return snap.data() as OpeningSecurityRecord;
  }

  async createIfAbsent(record: OpeningSecurityRecord): Promise<boolean> {
    const db = await this.getDb();
    const ref = this.getDocRef(db);
    return await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        return false;
      }
      tx.set(ref, record);
      return true;
    });
  }

  async update(record: OpeningSecurityRecord): Promise<void> {
    const db = await this.getDb();
    const ref = this.getDocRef(db);
    await ref.set(record, { merge: true });
  }

  async deleteRecord(): Promise<void> {
    const db = await this.getDb();
    const ref = this.getDocRef(db);
    await ref.delete();
  }
}

let customStore: ISecurityStore | null = null;
const memoryFallback = new InMemorySecurityStore();
const firestoreStore = new FirestoreSecurityStore();

export function setSecurityStore(store: ISecurityStore | null): void {
  customStore = store;
}

export function getSecurityStore(): ISecurityStore {
  if (customStore) {
    return customStore;
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return firestoreStore;
  }
  return memoryFallback;
}
