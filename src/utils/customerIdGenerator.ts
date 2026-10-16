import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Generates the next Customer ID in the format CUST-YYYY-NNN
 * e.g. CUST-2026-001, CUST-2026-002, ...
 * Thread-safe enough for single-office use (queries last record by createdAt).
 */
export async function generateCustomerId(): Promise<string> {
  const year   = new Date().getFullYear();
  const prefix = `CUST-${year}-`;

  try {
    const snap = await getDocs(
      query(collection(db, 'customers'), orderBy('createdAt', 'desc'), limit(50))
    );

    let maxNum = 0;
    snap.docs.forEach(d => {
      const cid: string = d.data().customerId || '';
      // Match CUST-YYYY-NNN where YYYY is the current year
      const match = cid.match(/^CUST-(\d{4})-(\d+)$/);
      if (match && parseInt(match[1]) === year) {
        const num = parseInt(match[2]);
        if (num > maxNum) maxNum = num;
      }
    });

    return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
  } catch {
    // Fallback using timestamp to avoid collision
    const ts = Date.now().toString().slice(-4);
    return `${prefix}${ts}`;
  }
}
