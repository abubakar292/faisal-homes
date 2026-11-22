'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { once } = require('events');
const { ZipArchive } = require('archiver');
const extract = require('extract-zip');
const config = require('../config');
const { pool } = require('../db/pool');
const settings = require('../lib/settings');
const { audit } = require('../lib/audit');
const { nowParts } = require('../lib/dates');
const { AppError, badRequest } = require('../lib/errors');

let running = false;
const NAME_RE = /^faisal-homes-\d{8}-\d{6}-(manual|auto|pre-restore|startup|pre-migration)\.zip$/;

function pgEnv() {
  const u = new URL(config.databaseUrl);
  return {
    ...process.env,
    PGHOST: u.hostname || 'localhost', PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username || 'postgres'), PGPASSWORD: decodeURIComponent(u.password || ''),
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, '')),
  };
}
function bin(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  return config.pgBinDir ? path.join(config.pgBinDir, exe) : exe;
}
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin(cmd), args, { env: pgEnv(), windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', (e) => reject(new AppError(500, `${cmd} could not be started. Install PostgreSQL client tools or set PG_BIN_DIR in .env (${e.message})`)));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new AppError(500, `${cmd} failed: ${err.trim().split('\n').slice(-3).join(' ')}`))));
  });
}
function stamp() {
  const { date, time } = nowParts();
  const sec = String(new Date().getSeconds()).padStart(2, '0');
  return `${date.replace(/-/g, '')}-${time.replace(':', '')}${sec}`;
}

async function createBackup(kind = 'manual', req = null) {
  if (running) throw new AppError(409, 'A backup or restore is already running. Please wait.');
  running = true;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-backup-'));
  try {
    fs.mkdirSync(config.backupDir, { recursive: true });
    const dump = path.join(tmp, 'database.dump');
    await run('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', `--file=${dump}`]);
    const counts = (await pool.query(`SELECT (SELECT COUNT(*) FROM customers)::int AS customers, (SELECT COUNT(*) FROM plots)::int AS plots,
      (SELECT COUNT(*) FROM bookings)::int AS bookings, (SELECT COUNT(*) FROM payments)::int AS payments, (SELECT COUNT(*) FROM expenses)::int AS expenses`)).rows[0];
    const name = `faisal-homes-${stamp()}-${kind}.zip`;
    const file = path.join(config.backupDir, name);
    const out = fs.createWriteStream(file);
    const zip = new ZipArchive({ zlib: { level: 6 } });
    zip.pipe(out);
    zip.file(dump, { name: 'database.dump' });
    if (fs.existsSync(config.uploadDir)) zip.directory(config.uploadDir, 'uploads');
    zip.append(JSON.stringify({ app: 'faisal-homes', format: 1, kind, created_at: new Date().toISOString(), counts }, null, 2), { name: 'backup.json' });
    await zip.finalize();
    await once(out, 'close');
    if (config.backupCopyDir) {
      try { fs.mkdirSync(config.backupCopyDir, { recursive: true }); fs.copyFileSync(file, path.join(config.backupCopyDir, name)); } catch (e) { console.error('[backup] copy to BACKUP_COPY_DIR failed:', e.message); }
    }
    if (kind === 'auto' || kind === 'startup') await applyRetention();
    const size = fs.statSync(file).size;
    await audit(null, req, { action: 'BACKUP', entity: 'backup', entityId: name, summary: `${kind} backup created (${(size / 1048576).toFixed(2)} MB)`, after: counts });
    return { name, size, counts };
  } finally {
    running = false;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function applyRetention() {
  const keep = Number((await settings.get('backup')).retention_count) || 30;
  const autos = listBackups().filter((b) => /-(auto|startup)\.zip$/.test(b.name));
  for (const b of autos.slice(keep)) fs.rmSync(path.join(config.backupDir, b.name), { force: true });
}

function listBackups() {
  if (!fs.existsSync(config.backupDir)) return [];
  return fs.readdirSync(config.backupDir).filter((f) => NAME_RE.test(f)).map((f) => {
    const st = fs.statSync(path.join(config.backupDir, f));
    return { name: f, size: st.size, created_at: st.mtime.toISOString(), kind: f.match(NAME_RE)[1] };
  }).sort((a, b) => (a.name < b.name ? 1 : -1));
}

function backupPath(name) {
  if (!NAME_RE.test(name)) throw badRequest('Invalid backup name');
  const p = path.join(config.backupDir, name);
  if (!fs.existsSync(p)) throw new AppError(404, 'Backup not found');
  return p;
}

/** Restore database + documents from a backup zip. A safety backup is taken first. */
async function restoreBackup(zipFile, req) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-restore-'));
  try {
    await extract(zipFile, { dir: tmp });
    const metaFile = path.join(tmp, 'backup.json');
    const dump = path.join(tmp, 'database.dump');
    if (!fs.existsSync(metaFile) || !fs.existsSync(dump)) throw badRequest('This file is not a FAISAL HOMES backup');
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    if (meta.app !== 'faisal-homes') throw badRequest('This file is not a FAISAL HOMES backup');
    const safety = await createBackup('pre-restore', req);
    if (running) throw new AppError(409, 'A backup or restore is already running.');
    running = true;
    try {
      await run('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--single-transaction', `--dbname=${pgEnv().PGDATABASE}`, dump]);
    } finally { running = false; }
    // Bring the restored database up to the current schema version (if the backup came from an older version).
    await require('../db/migrate').migrate({ quiet: true });
    const restoredUploads = path.join(tmp, 'uploads');
    if (fs.existsSync(restoredUploads)) {
      const old = `${config.uploadDir}.before-restore-${stamp()}`;
      if (fs.existsSync(config.uploadDir)) fs.renameSync(config.uploadDir, old);
      fs.cpSync(restoredUploads, config.uploadDir, { recursive: true });
    }
    await pool.query('DELETE FROM sessions');
    settings.invalidate();
    await audit(null, req, { action: 'RESTORE', entity: 'backup', entityId: path.basename(zipFile), summary: `Database restored from backup made ${meta.created_at}. Safety backup: ${safety.name}`, after: meta.counts });
    return { restored_from: meta, safety_backup: safety.name };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------- scheduler
let lastAutoDate = null;
function lastAutoTime() {
  const b = listBackups().find((x) => x.kind === 'auto' || x.kind === 'startup');
  return b ? new Date(b.created_at).getTime() : 0;
}
async function tick() {
  try {
    const cfg = await settings.get('backup');
    if (!cfg.auto_enabled) return;
    const { date, time } = nowParts();
    if (time === cfg.time && lastAutoDate !== date) {
      lastAutoDate = date;
      await createBackup('auto');
      console.log(`[backup] automatic backup done ${date} ${time}`);
    }
  } catch (e) { console.error('[backup] automatic backup failed:', e.message); }
}
function startScheduler() {
  setInterval(tick, 30 * 1000).unref();
  // Office PCs are often switched off at backup time: take a catch-up backup if the last one is older than 24 hours.
  setTimeout(async () => {
    try {
      const cfg = await settings.get('backup');
      if (cfg.auto_enabled && Date.now() - lastAutoTime() > 24 * 3600 * 1000) {
        await createBackup('startup');
        console.log('[backup] catch-up backup created at startup');
      }
    } catch (e) { console.error('[backup] startup backup failed:', e.message); }
  }, 60 * 1000).unref();
}

module.exports = { createBackup, listBackups, backupPath, restoreBackup, startScheduler, isRunning: () => running };
