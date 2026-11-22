'use strict';
// Database backups are made by Supabase (Dashboard → Database → Backups). This route keeps the
// "Export all data (Excel)" download so every table can be read without the software.
const express = require('express');
const { pool } = require('../db/pool');
const { requirePerm } = require('../middleware/auth');
const { tablesToXlsx } = require('../lib/excel');
const { audit } = require('../lib/audit');

const router = express.Router();
router.use(requirePerm('backup.manage'));

router.get('/export.xlsx', async (req, res) => {
  const tables = ['lands', 'land_price_adjustments', 'land_payments', 'capital_contributions', 'fund_allocations', 'societies', 'blocks', 'plots',
    'customers', 'bookings', 'installments', 'payments', 'charges', 'refunds', 'transfers', 'ownership_history', 'expense_categories', 'expenses',
    'ledger_entries', 'documents'];
  const data = [];
  for (const t of tables) data.push({ name: t, rows: (await pool.query(`SELECT * FROM ${t} ORDER BY id`)).rows });
  data.push({ name: 'users', rows: (await pool.query('SELECT id, email, full_name, role, is_active, created_at FROM users ORDER BY id')).rows });
  const buf = await tablesToXlsx(data);
  await audit(null, req, { action: 'EXPORT', entity: 'database', summary: 'Full database exported to Excel' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="faisal-homes-data-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(Buffer.from(buf));
});

module.exports = router;
