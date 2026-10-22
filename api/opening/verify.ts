import {
  isValidPinFormat,
  verifyPinHash,
  createToken,
  calculateLockout,
} from './_crypto.js';
import { getSecurityStore } from './_store.js';
import { parseJsonBody, sendJson } from './_http.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = await parseJsonBody(req);
    const { pin } = body;

    const store = getSecurityStore();
    const record = await store.get();

    if (!record) {
      return sendJson(res, 400, { ok: false, error: 'Opening password is not configured' });
    }

    const now = Date.now();

    // Check existing active lockout
    if (record.lockedUntil && record.lockedUntil > now) {
      return sendJson(res, 429, {
        ok: false,
        error: 'Verification is temporarily locked',
        lockedUntilMs: record.lockedUntil,
      });
    }

    // Reset expired lockout
    if (record.lockedUntil && record.lockedUntil <= now) {
      record.lockedUntil = null;
      record.failedAttempts = 0;
    }

    // Reject non-4-digit format
    if (!isValidPinFormat(pin)) {
      return sendJson(res, 400, { ok: false, error: 'PIN must be exactly 4 digits' });
    }

    const isMatch = verifyPinHash(pin, record.saltB64, record.hashB64, record.iterations);

    if (isMatch) {
      record.failedAttempts = 0;
      record.lockedUntil = null;
      record.updatedAt = new Date().toISOString();
      await store.update(record);

      const { token, exp } = createToken();
      return sendJson(res, 200, { ok: true, token, exp });
    }

    // Handle failed attempt
    const failed = (record.failedAttempts || 0) + 1;
    if (failed >= 5) {
      const nextLockRound = (record.lockCount || 0) + 1;
      const durationMs = calculateLockout(nextLockRound);
      const lockedUntil = now + durationMs;

      record.lockedUntil = lockedUntil;
      record.lockCount = nextLockRound;
      record.failedAttempts = 0;
      record.updatedAt = new Date().toISOString();
      await store.update(record);

      return sendJson(res, 429, {
        ok: false,
        error: 'Too many failed attempts. Verification locked.',
        lockedUntilMs: lockedUntil,
      });
    }

    record.failedAttempts = failed;
    record.updatedAt = new Date().toISOString();
    await store.update(record);

    return sendJson(res, 401, {
      ok: false,
      error: 'Incorrect opening password',
      remainingAttempts: 5 - failed,
    });
  } catch (err: any) {
    return sendJson(res, 500, { ok: false, error: 'Internal server error' });
  }
}
