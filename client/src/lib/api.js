// Thin fetch wrapper. All state-changing calls carry the X-FH-Request header (CSRF protection on the server).
export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || `Request failed (${status})`);
    this.status = status; this.code = data?.code; this.field = data?.field; this.details = data?.details; this.issues = data?.issues;
  }
}
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

async function request(method, url, body, { form } = {}) {
  const headers = { 'X-FH-Request': '1' };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try {
    res = await fetch(`/api${url}`, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, { error: 'Cannot reach the server. Check that FAISAL HOMES is running and the network is connected.' });
  }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/')) onUnauthorized(data);
    throw new ApiError(res.status, data);
  }
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b = {}) => request('POST', u, b),
  put: (u, b = {}) => request('PUT', u, b),
  del: (u) => request('DELETE', u),
  upload: (u, form) => request('POST', u, undefined, { form }),
};

export function qs(params) {
  const s = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') s.set(k, v); });
  const str = s.toString();
  return str ? `?${str}` : '';
}
export const openPdf = (url) => window.open(`/api${url}`, '_blank', 'noopener');
export const download = (url) => { const a = document.createElement('a'); a.href = `/api${url}`; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); };
