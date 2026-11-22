'use strict';
const path = require('path');
require('dotenv').config({ path: process.env.FH_ENV_FILE || path.resolve(__dirname, '../../.env'), quiet: true });

const root = path.resolve(__dirname, '../..');
const storageDir = path.resolve(root, process.env.STORAGE_DIR || 'storage');

module.exports = {
  root,
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/faisal_homes',
  timezone: process.env.APP_TIMEZONE || 'Asia/Karachi',
  storageDir,
  uploadDir: path.join(storageDir, 'uploads'),
  backupDir: path.resolve(root, process.env.BACKUP_DIR || path.join(storageDir, 'backups')),
  backupCopyDir: process.env.BACKUP_COPY_DIR ? path.resolve(process.env.BACKUP_COPY_DIR) : null,
  pgBinDir: process.env.PG_BIN_DIR || '',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 10),
  disableScheduler: process.env.DISABLE_SCHEDULER === 'true',
  clientDist: path.join(root, 'client', 'dist'),
};
