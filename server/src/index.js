'use strict';
// FAISAL HOMES API server entry point: creates storage folders, runs migrations, starts the backup scheduler and HTTP server.
const fs = require('fs');
const config = require('./config');
const { migrate } = require('./db/migrate');
const { createApp } = require('./app');
const { startScheduler } = require('./services/backupService');

async function main() {
  for (const d of [config.storageDir, config.uploadDir, config.backupDir]) fs.mkdirSync(d, { recursive: true });
  await migrate({ quiet: true, backupFirst: true });
  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    console.log(`FAISAL HOMES running on http://localhost:${config.port}`);
    console.log('Keep this window open while you use the software. Close it to stop.');
  });
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`Port ${config.port} is already in use. FAISAL HOMES is probably already running: open http://localhost:${config.port}`);
      process.exit(1);
    }
    throw e;
  });
  if (!config.disableScheduler) startScheduler();
}

function friendly(e) {
  const m = e && e.message ? e.message : String(e);
  if (/ECONNREFUSED/.test(m)) return 'Cannot connect to the PostgreSQL database. Make sure the PostgreSQL service is running (Windows: Services > postgresql-x64-16 > Start).';
  if (/password authentication failed/i.test(m)) return 'The database password in the .env file is not correct.';
  if (/does not exist/.test(m) && /database/.test(m)) return `The database does not exist yet. Run the installer again. (${m})`;
  return m;
}
main().catch((e) => { console.error('FAISAL HOMES could not start:', friendly(e)); process.exit(1); });
