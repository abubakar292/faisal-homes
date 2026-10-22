import { getSecurityStore } from './_store.js';
import { sendJson } from './_http.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const store = getSecurityStore();
    const record = await store.get();
    const configured = Boolean(record && record.hashB64 && record.saltB64);
    return sendJson(res, 200, { configured });
  } catch (err: any) {
    return sendJson(res, 500, { error: 'Failed to retrieve opening status' });
  }
}
