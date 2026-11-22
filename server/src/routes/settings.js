'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const config = require('../config');
const { pool, withTx } = require('../db/pool');
const { requirePerm } = require('../middleware/auth');
const settings = require('../lib/settings');
const { audit } = require('../lib/audit');
const { badRequest } = require('../lib/errors');
const { z, parse, bool } = require('../lib/validate');

const router = express.Router();

const num = (label, min, max) => z.coerce.number({ invalid_type_error: `${label} must be a number` })
  .refine((n) => n >= min && n <= max, `${label} must be between ${min} and ${max}`);
const SCHEMAS = {
  company: z.object({
    name: z.string().trim().min(1, 'Company name is required').max(80),
    tagline: z.string().trim().max(120).optional().default(''),
    address: z.string().trim().max(300).optional().default(''),
    phone: z.string().trim().max(100).optional().default(''),
    email: z.string().trim().max(100).optional().default(''),
    website: z.string().trim().max(100).optional().default(''),
  }),
  measurement: z.object({ marla_sqft: num('Marla square feet', 100, 1000), kanal_marla: num('Marla per Kanal', 1, 100) }),
  display: z.object({ number_format: z.enum(['intl', 'lakh']), date_format: z.literal('DD-MM-YYYY').default('DD-MM-YYYY'), language: z.enum(['en', 'ur']).default('en') }),
  security: z.object({ session_timeout_minutes: num('Session timeout', 5, 1440) }),
  late_fee: z.object({ enabled: bool, mode: z.enum(['FIXED', 'PERCENT']), value: num('Late fee value', 0, 100000000), grace_days: num('Grace days', 0, 365) }),
  installments: z.object({ default_rounding: z.coerce.number().refine((n) => [1, 10, 100, 500, 1000, 5000].includes(n), 'Invalid rounding') }),
  backup: z.object({
    auto_enabled: bool,
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Backup time must be HH:MM (24-hour)'),
    retention_count: num('Number of backups to keep', 3, 365),
  }),
  receipt: z.object({
    footer_note: z.string().max(400).optional().default(''),
    signature_label: z.string().max(60).optional().default('Authorized Signature'),
    booking_terms: z.string().max(4000).optional().default(''),
  }),
};

router.get('/', requirePerm('settings.manage'), async (_req, res) => {
  const all = await settings.getAll(pool);
  res.json({ ...all, backup_state: undefined, _paths: { backupDir: config.backupDir, backupCopyDir: config.backupCopyDir, uploadDir: config.uploadDir } });
});

router.put('/', requirePerm('settings.manage'), async (req, res) => {
  const updates = {};
  for (const [key, schema] of Object.entries(SCHEMAS)) {
    if (req.body[key] !== undefined) updates[key] = parse(schema, req.body[key]);
  }
  if (!Object.keys(updates).length) throw badRequest('Nothing to update');
  await withTx(async (c) => {
    for (const [key, value] of Object.entries(updates)) {
      const before = (await c.query('SELECT value FROM settings WHERE key = $1', [key])).rows[0]?.value;
      await c.query(`INSERT INTO settings (key, value, updated_at, updated_by) VALUES ($1,$2,now(),$3)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
      [key, JSON.stringify(value), req.user.id]);
      await audit(c, req, { action: 'UPDATE', entity: 'settings', entityId: key, summary: `Settings "${key}" updated`, before, after: value });
    }
  });
  settings.invalidate();
  res.json(await settings.getAll(pool));
});

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(png|jpeg)$/.test(file.mimetype)),
});
router.post('/logo', requirePerm('settings.manage'), logoUpload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('Upload a PNG or JPG image (max 2 MB)');
  const dir = path.join(config.uploadDir, 'branding');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.startsWith('logo.')) fs.unlinkSync(path.join(dir, f));
  const ext = req.file.mimetype === 'image/png' ? 'png' : 'jpg';
  fs.writeFileSync(path.join(dir, `logo.${ext}`), req.file.buffer);
  await audit(null, req, { action: 'UPDATE', entity: 'settings', entityId: 'logo', summary: 'Company logo uploaded' });
  res.json({ ok: true });
});
router.delete('/logo', requirePerm('settings.manage'), async (req, res) => {
  const dir = path.join(config.uploadDir, 'branding');
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.startsWith('logo.')) fs.unlinkSync(path.join(dir, f));
  await audit(null, req, { action: 'DELETE', entity: 'settings', entityId: 'logo', summary: 'Company logo removed' });
  res.json({ ok: true });
});

// Expense categories are configured from settings too (cost type drives profit calculation).
router.get('/expense-categories', async (_req, res) => {
  res.json((await pool.query('SELECT * FROM expense_categories ORDER BY sort_order, name')).rows);
});
const catSchema = z.object({ name: z.string().trim().min(2, 'Category name is required').max(60), cost_type: z.enum(['LAND_PAYMENT', 'PROJECT', 'OPERATING']), is_active: bool.default(true) });
router.post('/expense-categories', requirePerm('settings.manage'), async (req, res) => {
  const b = parse(catSchema, { is_active: true, ...req.body });
  const row = await withTx(async (c) => {
    const r = (await c.query(`INSERT INTO expense_categories (name, cost_type, is_active, sort_order)
      VALUES ($1,$2,$3,(SELECT COALESCE(MAX(sort_order),0)+1 FROM expense_categories)) RETURNING *`, [b.name, b.cost_type, b.is_active])).rows[0];
    await audit(c, req, { action: 'CREATE', entity: 'expense_category', entityId: r.id, summary: `Expense category ${r.name} created`, after: r });
    return r;
  });
  res.status(201).json(row);
});
router.put('/expense-categories/:id', requirePerm('settings.manage'), async (req, res) => {
  const b = parse(catSchema, req.body);
  const row = await withTx(async (c) => {
    const before = (await c.query('SELECT * FROM expense_categories WHERE id=$1', [Number(req.params.id)])).rows[0];
    if (!before) throw badRequest('Category not found');
    const r = (await c.query('UPDATE expense_categories SET name=$2, cost_type=$3, is_active=$4 WHERE id=$1 RETURNING *',
      [before.id, b.name, b.cost_type, b.is_active])).rows[0];
    await audit(c, req, { action: 'UPDATE', entity: 'expense_category', entityId: r.id, summary: `Expense category ${r.name} updated`, before, after: r });
    return r;
  });
  res.json(row);
});

module.exports = router;
