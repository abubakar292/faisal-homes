import {
  isValidPinFormat,
  verifyPinHash,
  createRecord,
  verifyToken,
  createToken,
} from './_crypto.js';
import { getSecurityStore } from './_store.js';
import { parseJsonBody, sendJson } from './_http.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = await parseJsonBody(req);
    const authHeader = req.headers?.authorization;
    let token = body.token;

    if (!token && authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }

    const tokenVerification = verifyToken(token);
    if (!tokenVerification.valid) {
      return sendJson(res, 401, { ok: false, error: 'Unauthorized: valid token required' });
    }

    const { currentPin, newPin, confirm } = body;

    if (!isValidPinFormat(currentPin)) {
      return sendJson(res, 400, { ok: false, error: 'Current PIN must be exactly 4 digits' });
    }

    if (!isValidPinFormat(newPin)) {
      return sendJson(res, 400, { ok: false, error: 'New PIN must be exactly 4 digits' });
    }

    if (newPin !== confirm) {
      return sendJson(res, 400, { ok: false, error: 'New PIN and confirmation do not match' });
    }

    const store = getSecurityStore();
    const record = await store.get();

    if (!record) {
      return sendJson(res, 400, { ok: false, error: 'Opening password is not configured' });
    }

    const matches = verifyPinHash(currentPin, record.saltB64, record.hashB64, record.iterations);
    if (!matches) {
      return sendJson(res, 401, { ok: false, error: 'Current PIN is incorrect' });
    }

    const updated = createRecord(newPin);
    await store.update(updated);

    const { token: newToken, exp } = createToken();
    return sendJson(res, 200, {
      ok: true,
      message: 'Opening password changed successfully',
      token: newToken,
      exp,
    });
  } catch (err: any) {
    return sendJson(res, 500, { ok: false, error: 'Internal server error' });
  }
}
