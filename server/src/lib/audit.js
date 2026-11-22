'use strict';
const { pool } = require('../db/pool');

/**
 * Write an audit record. Pass the transaction client so the audit row commits/rolls back with the change.
 * @param {object} db  pg client or pool
 * @param {object} req express request (for user + ip) or null
 */
async function audit(db, req, { action, entity, entityId, summary, before, after, user }) {
  const u = user || req?.user || null;
  await (db || pool).query(
    `INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, summary, before_data, after_data, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [u?.id || null, u?.username || null, action, entity || null, entityId != null ? String(entityId) : null,
      summary || null, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, req?.ip || null]);
}
module.exports = { audit };
