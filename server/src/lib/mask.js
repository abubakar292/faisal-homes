'use strict';
const { can } = require('./permissions');
function maskCnic(v) {
  if (!v) return v;
  const s = String(v);
  return s.length === 15 ? `${s.slice(0, 5)}-*******-${s.slice(14)}` : '*************';
}
const CNIC_FIELDS = ['cnic', 'nominee_cnic', 'guarantor_cnic', 'customer_cnic', 'from_cnic', 'to_cnic', 'seller_cnic'];
/** Mask CNIC fields for roles without the cnic.full permission. Works on objects or arrays. */
function maskFor(req, data) {
  if (!req.user || can(req.user.role, 'cnic.full')) return data;
  const fix = (o) => {
    if (!o || typeof o !== 'object') return o;
    for (const f of CNIC_FIELDS) if (o[f]) o[f] = maskCnic(o[f]);
    return o;
  };
  if (Array.isArray(data)) return data.map(fix);
  fix(data);
  for (const v of Object.values(data)) {
    if (Array.isArray(v)) v.forEach(fix); else if (v && typeof v === 'object') fix(v);
  }
  return data;
}
module.exports = { maskCnic, maskFor };
