import { isValidPinFormat, createRecord, createToken } from './_crypto.js';
import { getSecurityStore } from './_store.js';
import { parseJsonBody, sendJson } from './_http.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = await parseJsonBody(req);
    const { pin, confirm } = body;

    if (!isValidPinFormat(pin)) {
      return sendJson(res, 400, { ok: false, error: 'PIN must be exactly 4 digits' });
    }

    if (pin !== confirm) {
      return sendJson(res, 400, { ok: false, error: 'PIN confirmation does not match' });
    }

    const store = getSecurityStore();
    const existing = await store.get();
    if (existing) {
      return sendJson(res, 409, { ok: false, error: 'Opening password already configured' });
    }

    const newRecord = createRecord(pin);
    const created = await store.createIfAbsent(newRecord);
    if (!created) {
      return sendJson(res, 409, { ok: false, error: 'Opening password already configured' });
    }

    const { token, exp } = createToken();
    return sendJson(res, 200, {
      ok: true,
      message: 'Opening password set successfully',
      token,
      exp,
    });
  } catch (err: any) {
    return sendJson(res, 500, { ok: false, error: 'Internal server error' });
  }
}
