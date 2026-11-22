'use strict';
// Usage: npm run create-admin -- <username> <password> "<Full Name>"
const bcrypt = require('bcryptjs');
const { pool } = require('./pool');

async function main() {
  const [username = 'admin', password, fullName = 'Administrator'] = process.argv.slice(2);
  if (!password || password.length < 8) {
    console.error('Usage: npm run create-admin -- <username> <password-min-8-chars> "<Full Name>"');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  const r = await pool.query(
    `INSERT INTO users (username, full_name, password_hash, role, must_change_password)
     VALUES ($1,$2,$3,'ADMIN',false)
     ON CONFLICT ((lower(username))) DO UPDATE SET password_hash = EXCLUDED.password_hash, role='ADMIN', is_active=true
     RETURNING id`, [username, fullName, hash]);
  console.log(`Admin user "${username}" ready (id ${r.rows[0].id}).`);
  await pool.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
