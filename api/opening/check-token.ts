import { verifyToken } from './_crypto.js';
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

    const result = verifyToken(token);
    if (!result.valid) {
      return sendJson(res, 200, { valid: false });
    }

    return sendJson(res, 200, { valid: true, exp: result.exp });
  } catch (err: any) {
    return sendJson(res, 500, { valid: false, error: 'Internal server error' });
  }
}
