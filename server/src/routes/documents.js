'use strict';
// Documents linked to records, stored in the private Supabase Storage bucket.
// Upload is two steps so large files never pass through the server (Vercel limits request size):
//   1. POST /documents/upload-url  → the server checks permission + file type and returns a one-time upload link
//   2. the browser uploads the file straight to Supabase Storage with that link
//   3. POST /documents             → the server checks the stored file and records it
// Viewing: GET /documents/:id/file checks permission, then redirects to a link that works for 60 seconds.
const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const { pool, withTx } = require('../db/pool');
const { requirePerm } = require('../middleware/auth');
const { audit } = require('../lib/audit');
const supa = require('../lib/supabase');
const { notFound, badRequest } = require('../lib/errors');
const { z, parse, intId, optText } = require('../lib/validate');

const router = express.Router();
require('../lib/validate').numericParams(router, 'id');

const ENTITY_TABLE = { CUSTOMER: 'customers', PLOT: 'plots', LAND: 'lands', BOOKING: 'bookings', TRANSFER: 'transfers', EXPENSE: 'expenses', PAYMENT: 'payments', SOCIETY: 'societies' };
const DOC_TYPES = ['PHOTO', 'CNIC_FRONT', 'CNIC_BACK', 'BOOKING_FORM', 'SALE_AGREEMENT', 'PAYMENT_RECEIPT', 'TRANSFER_DOCUMENT', 'REGISTRY', 'MUTATION',
  'OWNERSHIP_DOCUMENT', 'EXPENSE_RECEIPT', 'LEGAL_DOCUMENT', 'OTHER'];
const SENSITIVE = ['PHOTO', 'CNIC_FRONT', 'CNIC_BACK'];
const ALLOWED = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf',
  'application/msword': '.doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx' };
const MIME_BY_EXT = Object.fromEntries(Object.entries(ALLOWED).map(([m, e]) => [e, m]));
const STORED_RE = /^documents\/\d{4}-\d{2}\/[a-f0-9]{32}\.(jpg|png|webp|pdf|doc|docx|xls|xlsx)$/;
const TYPES_HINT = `JPG, PNG, WEBP, PDF, Word or Excel, max ${config.maxUploadMb} MB`;

const linkSchema = {
  entity_type: z.enum(Object.keys(ENTITY_TABLE), { errorMap: () => ({ message: 'Document must be linked to a record' }) }),
  entity_id: intId('Linked record'),
  doc_type: z.string().optional().transform((v) => (DOC_TYPES.includes(v) ? v : 'OTHER')),
};

async function checkLinked(db, et, eid) {
  if (!(await db.query(`SELECT 1 FROM ${ENTITY_TABLE[et]} WHERE id=$1`, [eid])).rowCount) throw notFound('Linked record');
}

router.get('/', requirePerm('document.view'), async (req, res) => {
  const { entity_type: et, entity_id: eid } = req.query;
  if (!ENTITY_TABLE[et] || !eid) throw badRequest('entity_type and entity_id are required');
  const r = await pool.query(`SELECT d.id, d.entity_type, d.entity_id, d.doc_type, d.title, d.original_name, d.mime_type, d.size_bytes, d.uploaded_at, u.full_name AS uploaded_by_name
    FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.entity_type=$1 AND d.entity_id=$2 AND NOT d.is_deleted ORDER BY d.id DESC`, [et, Number(eid)]);
  res.json(r.rows);
});

router.post('/upload-url', requirePerm('document.upload'), async (req, res) => {
  const b = parse(z.object({ ...linkSchema, file_name: z.string().trim().min(1, 'Choose a file'), mime_type: z.string(), size: z.coerce.number().int().min(1, 'The file is empty') }), req.body);
  if (!ALLOWED[b.mime_type]) throw badRequest(`This type of file cannot be uploaded (${TYPES_HINT})`);
  if (b.size > config.maxUploadMb * 1024 * 1024) throw badRequest(`File is too large (${TYPES_HINT})`);
  if (b.doc_type === 'PHOTO' && !b.mime_type.startsWith('image/')) throw badRequest('Photo must be an image');
  await checkLinked(pool, b.entity_type, b.entity_id);
  const path = `documents/${new Date().toISOString().slice(0, 7)}/${crypto.randomBytes(16).toString('hex')}${ALLOWED[b.mime_type]}`;
  const up = await supa.createUploadUrl(path);
  res.json({ bucket: config.storageBucket, path: up.path, token: up.token });
});

router.post('/', requirePerm('document.upload'), async (req, res) => {
  const b = parse(z.object({ ...linkSchema, stored_name: z.string(), original_name: z.string().trim().min(1).max(200), title: optText }), req.body);
  if (!STORED_RE.test(b.stored_name)) throw badRequest('Upload the file first');
  const info = await supa.objectInfo(b.stored_name);
  if (!info) throw badRequest('The file did not finish uploading. Please try again.');
  const ext = b.stored_name.slice(b.stored_name.lastIndexOf('.'));
  const mime = ALLOWED[info.contentType] ? info.contentType : MIME_BY_EXT[ext];
  if (info.size > config.maxUploadMb * 1024 * 1024) {
    await supa.removeObjects([b.stored_name]);
    throw badRequest(`File is too large (${TYPES_HINT})`);
  }
  if (b.doc_type === 'PHOTO' && !mime.startsWith('image/')) throw badRequest('Photo must be an image');
  const row = await withTx(async (c) => {
    await checkLinked(c, b.entity_type, b.entity_id);
    const d = (await c.query(
      `INSERT INTO documents (entity_type, entity_id, doc_type, title, original_name, stored_name, mime_type, size_bytes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [b.entity_type, b.entity_id, b.doc_type, b.title ? b.title.slice(0, 150) : null, b.original_name, b.stored_name, mime, info.size, req.user.id])).rows[0];
    if (b.entity_type === 'CUSTOMER' && b.doc_type === 'PHOTO') await c.query('UPDATE customers SET photo_document_id=$2 WHERE id=$1', [b.entity_id, d.id]);
    await audit(c, req, { action: 'UPLOAD', entity: b.entity_type.toLowerCase(), entityId: b.entity_id, summary: `Document uploaded: ${b.doc_type} "${d.original_name}"` });
    return d;
  });
  res.status(201).json(row);
});

router.get('/:id/file', requirePerm('document.view'), async (req, res) => {
  const d = (await pool.query('SELECT * FROM documents WHERE id=$1 AND NOT is_deleted', [Number(req.params.id)])).rows[0];
  if (!d) throw notFound('Document');
  if (SENSITIVE.includes(d.doc_type) && d.doc_type !== 'PHOTO') {
    await audit(null, req, { action: 'VIEW_DOCUMENT', entity: d.entity_type.toLowerCase(), entityId: d.entity_id, summary: `Viewed ${d.doc_type} document #${d.id}` });
  }
  const url = await supa.signedDownloadUrl(d.stored_name, 60, req.query.download ? d.original_name : undefined);
  res.set('Cache-Control', 'private, no-store');
  res.redirect(302, url);
});

// Soft delete only: the file stays in storage for audit purposes.
router.delete('/:id', requirePerm('document.delete'), async (req, res) => {
  const id = Number(req.params.id);
  await withTx(async (c) => {
    const d = (await c.query('UPDATE documents SET is_deleted=true, deleted_at=now(), deleted_by=$2 WHERE id=$1 AND NOT is_deleted RETURNING *', [id, req.user.id])).rows[0];
    if (!d) throw notFound('Document');
    if (d.entity_type === 'CUSTOMER') await c.query('UPDATE customers SET photo_document_id=NULL WHERE photo_document_id=$1', [id]);
    await audit(c, req, { action: 'DELETE', entity: d.entity_type.toLowerCase(), entityId: d.entity_id, summary: `Document removed: ${d.doc_type} "${d.original_name}"` });
  });
  res.json({ ok: true });
});

module.exports = router;
module.exports.DOC_TYPES = DOC_TYPES;
