'use strict';
// Local development server: node server/src/index.js (on Vercel, api/index.js is used instead).
// The database is created once by running supabase/schema.sql in the Supabase SQL Editor.
const config = require('./config');
const { createApp } = require('./app');

const app = createApp();
const server = app.listen(config.port, config.host, () => {
  console.log(`FAISAL HOMES API running on http://localhost:${config.port}`);
  if (!config.supabaseUrl || !config.supabaseAnonKey || !config.supabaseServiceKey) {
    console.warn('Warning: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be set in .env for login and documents to work.');
  }
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} is already in use. FAISAL HOMES is probably already running: open http://localhost:${config.port}`);
    process.exit(1);
  }
  throw e;
});
