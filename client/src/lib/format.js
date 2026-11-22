// Formatting helpers: Pakistani Rupees, dates (DD-MM-YYYY), Marla/Kanal areas.
let numberStyle = 'intl';
let measurement = { marla_sqft: 272.25, kanal_marla: 20 };
export function configureFormat({ display, measurement: m } = {}) {
  if (display?.number_format) numberStyle = display.number_format;
  if (m) measurement = { ...measurement, ...m };
}
function group(intStr) {
  if (numberStyle === 'lakh' && intStr.length > 3) {
    return `${intStr.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${intStr.slice(-3)}`;
  }
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
export function num(v, { decimals } = {}) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  const neg = n < 0;
  const p = Math.round(Math.abs(n) * 100);
  const int = group(String(Math.floor(p / 100)));
  const dec = p % 100 || decimals ? `.${String(p % 100).padStart(2, '0')}` : '';
  return `${neg ? '-' : ''}${int}${dec}`;
}
export const pkr = (v) => (v === null || v === undefined || v === '' ? '—' : `Rs ${num(v)}`);
export function shortPkr(v) {
  const n = Number(v || 0);
  const a = Math.abs(n);
  if (a >= 10000000) return `Rs ${(n / 10000000).toFixed(2).replace(/\.?0+$/, '')} Cr`;
  if (a >= 100000) return `Rs ${(n / 100000).toFixed(2).replace(/\.?0+$/, '')} Lac`;
  return pkr(n);
}
export function date(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, dd] = s.split('-');
  return y && m && dd ? `${dd}-${m}-${y}` : s;
}
export function dateTime(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return `${date(dt.toLocaleDateString('en-CA'))} ${dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}
export const marla = (v) => (v === null || v === undefined ? '—' : `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 4 })} Marla`);
export function area(totalMarla) {
  const m = Number(totalMarla || 0);
  const k = Math.floor(m / measurement.kanal_marla);
  const rest = Math.round((m - k * measurement.kanal_marla) * 100) / 100;
  return k ? `${k} Kanal ${rest ? `${rest} Marla` : ''}`.trim() : `${rest} Marla`;
}
export const sqft = (v) => `${Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} sq ft`;
export const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });

export const STATUS = {
  AVAILABLE: { label: 'Available', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20', tile: 'bg-emerald-500 hover:bg-emerald-600', dot: 'bg-emerald-500' },
  RESERVED: { label: 'Reserved', cls: 'bg-amber-100 text-amber-800 ring-amber-600/20', tile: 'bg-amber-400 hover:bg-amber-500', dot: 'bg-amber-400' },
  BOOKED: { label: 'Booked', cls: 'bg-blue-100 text-blue-800 ring-blue-600/20', tile: 'bg-blue-600 hover:bg-blue-700', dot: 'bg-blue-600' },
  SOLD: { label: 'Sold', cls: 'bg-rose-100 text-rose-800 ring-rose-600/20', tile: 'bg-rose-600 hover:bg-rose-700', dot: 'bg-rose-600' },
  TRANSFERRED: { label: 'Transferred', cls: 'bg-violet-100 text-violet-800 ring-violet-600/20', tile: 'bg-violet-600 hover:bg-violet-700', dot: 'bg-violet-600' },
  CANCELLED: { label: 'Withdrawn', cls: 'bg-slate-200 text-slate-700 ring-slate-500/20', tile: 'bg-slate-400 hover:bg-slate-500', dot: 'bg-slate-400' },
  ACTIVE: { label: 'Active', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20' },
  VALID: { label: 'Valid', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20' },
  REVERSED: { label: 'Reversed', cls: 'bg-red-100 text-red-800 ring-red-600/20' },
  WAIVED: { label: 'Waived', cls: 'bg-slate-200 text-slate-700 ring-slate-500/20' },
  PAID: { label: 'Paid', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20' },
  PARTIAL: { label: 'Partial', cls: 'bg-amber-100 text-amber-800 ring-amber-600/20' },
  OVERDUE: { label: 'Overdue', cls: 'bg-red-100 text-red-800 ring-red-600/20' },
  DUE: { label: 'Due', cls: 'bg-slate-100 text-slate-700 ring-slate-500/20' },
  ARCHIVED: { label: 'Archived', cls: 'bg-slate-200 text-slate-700 ring-slate-500/20' },
};
export const METHODS = [['CASH', 'Cash'], ['BANK_TRANSFER', 'Bank Transfer'], ['CHEQUE', 'Cheque'], ['OTHER', 'Other']];
export const methodLabel = (m) => Object.fromEntries(METHODS)[m] || m;
export const PLANS = [['MONTHLY', 'Monthly'], ['QUARTERLY', 'Quarterly'], ['HALF_YEARLY', 'Half-yearly'], ['YEARLY', 'Yearly'], ['FULL', 'Full payment'], ['CUSTOM', 'Custom schedule']];
export const planLabel = (p) => Object.fromEntries(PLANS)[p] || p;
export const ROLES = [['ADMIN', 'Admin'], ['ACCOUNTANT', 'Accountant'], ['SALES', 'Sales Staff'], ['VIEWER', 'Viewer (read only)']];
export const roleLabel = (r) => Object.fromEntries(ROLES)[r] || r;
export function installmentStatus(i, today = todayStr()) {
  const amt = Math.round(Number(i.amount) * 100); const paid = Math.round(Number(i.paid_amount) * 100);
  if (paid >= amt) return 'PAID';
  if (i.due_date < today) return 'OVERDUE';
  if (paid > 0) return 'PARTIAL';
  return 'DUE';
}
export const toPaisa = (v) => Math.round(Number(String(v ?? '').replace(/,/g, '') || 0) * 100);
