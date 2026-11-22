'use strict';
const express = require('express');
const os = require('os');
const fs = require('fs');
const multer = require('multer');
const { pool } = require('../db/pool');
const { requirePerm } = require('../middleware/auth');
const svc = require('../services/backupService');
const { tablesToXlsx } = require('../lib/excel');
const { audit } = require('../lib/audit');
const { badRequest } = require('../lib/errors');
const { z, parse } = require('../lib/validate');

const router = express.Router();
router.use(requirePerm('backup.manage'));

router.get('/', (_req, res) => res.json({ backups: svc.listBackups(), running: svc.isRunning() }));
router.post('/', async (req, res) => res.status(201).json(await svc.createBackup('manual', req)));
router.get('/download/:name', async (req, res) => {
  const p = svc.backupPath(req.params.name);
  await audit(null, req, { action: 'EXPORT', entity: 'backup', entityId: req.params.name, summary: `Backup ${req.params.name} downloaded` });
  res.download(p, req.params.name);
});

// Restore needs the typed confirmation word to avoid accidents.
router.post('/restore/:name', async (req, res) => {
  const { confirm } = parse(z.object({ confirm: z.string() }), req.body);
  if (confirm !== 'RESTORE') throw badRequest('Type RESTORE to confirm');
  res.json(await svc.restoreBackup(svc.backupPath(req.params.name), req));
});
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 4 * 1024 * 1024 * 1024 } });
router.post('/restore-upload', upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('Choose a backup .zip file');
  try {
    if (req.body.confirm !== 'RESTORE') throw badRequest('Type RESTORE to confirm');
    res.json(await svc.restoreBackup(req.file.path, req));
  } finally { fs.rm(req.file.path, { force: true }, () => {}); }
});

// Full data export (all main tables) as one Excel workbook.
router.get('/export.xlsx', async (req, res) => {
  const tables = ['lands', 'societies', 'blocks', 'plots', 'customers', 'bookings', 'installments', 'payments', 'charges', 'refunds', 'transfers',
    'ownership_history', 'expense_categories', 'expenses', 'ledger_entries'];
  const data = [];
  for (const t of tables) data.push({ name: t, rows: (await pool.query(`SELECT * FROM ${t} ORDER BY id`)).rows });
  data.push({ name: 'users', rows: (await pool.query('SELECT id, username, full_name, role, is_active, created_at FROM users ORDER BY id')).rows });
  const buf = await tablesToXlsx(data);
  await audit(null, req, { action: 'EXPORT', entity: 'database', summary: 'Full database exported to Excel' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="faisal-homes-data-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(Buffer.from(buf));
});

module.exports = router;
