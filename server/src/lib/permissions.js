'use strict';
// Role-based permission matrix. Keep in sync with client/src/lib/permissions.js (served via /api/auth/me).
const A = 'ADMIN', AC = 'ACCOUNTANT', S = 'SALES', V = 'VIEWER';
const MATRIX = {
  'dashboard.finance': [A, AC, V],
  'land.view': [A, AC, V],
  'land.edit': [A],
  'land.pay': [A, AC],
  'land.reverse': [A],
  'land.price_override': [A],
  'investment.view': [A, AC, V],
  'investment.manage': [A, AC],
  'society.view': [A, AC, S, V],
  'society.edit': [A],
  'plot.view': [A, AC, S, V],
  'plot.edit': [A],
  'plot.reserve': [A, S],
  'customer.view': [A, AC, S, V],
  'customer.edit': [A, S],
  'cnic.full': [A, AC, S],
  'booking.view': [A, AC, S, V],
  'booking.create': [A, S],
  'booking.cancel': [A],
  'schedule.edit': [A],
  'charge.manage': [A],
  'payment.view': [A, AC, S, V],
  'payment.create': [A, AC],
  'payment.reverse': [A],
  'transfer.view': [A, AC, S, V],
  'transfer.create': [A],
  'expense.view': [A, AC, V],
  'expense.edit': [A, AC],
  'expense.cancel': [A],
  'report.view': [A, AC, V],
  'document.view': [A, AC, S],
  'document.upload': [A, AC, S],
  'document.delete': [A],
  'users.manage': [A],
  'settings.manage': [A],
  'audit.view': [A],
  'backup.manage': [A],
};
const ROLES = [A, AC, S, V];
function can(role, perm) { return !!MATRIX[perm] && MATRIX[perm].includes(role); }
function permissionsFor(role) { return Object.keys(MATRIX).filter((p) => MATRIX[p].includes(role)); }
module.exports = { MATRIX, ROLES, can, permissionsFor };
