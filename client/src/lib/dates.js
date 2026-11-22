// Date-only helpers working on 'YYYY-MM-DD' strings (no timezone shifts).
const pad = (n) => String(n).padStart(2, '0');
export function addMonthsStr(s, n) {
  if (!s) return s;
  const [y, m, d] = s.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  const ny = Math.floor(t / 12); const nm = t - ny * 12 + 1;
  const dim = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${pad(nm)}-${pad(Math.min(d, dim))}`;
}
export function addDaysStr(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
