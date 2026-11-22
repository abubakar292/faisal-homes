'use strict';
// Create a full backup (database + documents) from the command line:  node server/src/db/backup-cli.js
const { createBackup } = require('../services/backupService');
const { pool } = require('./pool');

createBackup('manual')
  .then(async (b) => { console.log(`Backup created: ${b.name} (${(b.size / 1048576).toFixed(2)} MB)`); await pool.end(); })
  .catch(async (e) => { console.error(`Backup failed: ${e.message}`); await pool.end().catch(() => {}); process.exit(1); });
