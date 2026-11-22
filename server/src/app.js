'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const config = require('./config');
const { loadUser, requireAuth, csrfGuard } = require('./middleware/auth');
const { errorHandler } = require('./middleware/error');

function createApp() {
  const app = express();
  // On Vercel every request arrives through Vercel's proxy; locally only the Vite dev proxy is trusted.
  app.set('trust proxy', config.onVercel ? true : 'loopback');
  app.disable('x-powered-by');
  // The browser talks to Supabase directly for sign-in and file uploads, and opens files through
  // short-lived Supabase Storage links.
  const supabase = config.supabaseUrl ? [config.supabaseUrl] : [];
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'connect-src': ["'self'", ...supabase],
        'img-src': ["'self'", 'data:', 'blob:', ...supabase],
        'frame-src': ["'self'", 'blob:', ...supabase],
        'object-src': ["'self'"],
        'upgrade-insecure-requests': null,
      },
    },
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: config.onVercel,
  }));
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  api.use(csrfGuard);
  // /api/health?db=1 also checks the database (connection, password, tables); errors explain what to fix.
  api.get('/health', async (req, res) => {
    if (!req.query.db) return res.json({ ok: true });
    const r = await require('./db/pool').pool.query("SELECT current_setting('TimeZone') AS timezone, (SELECT string_agg(name, ',') FROM schema_migrations) AS schema");
    res.json({ ok: true, database: 'connected', ...r.rows[0] });
  });
  api.use('/public', require('./routes/public'));
  api.use(loadUser);
  api.use('/auth', require('./routes/auth'));
  api.use(requireAuth);
  api.use('/dashboard', require('./routes/dashboard'));
  api.use('/settings', require('./routes/settings'));
  api.use('/users', require('./routes/users'));
  api.use('/audit', require('./routes/audit'));
  api.use('/lands', require('./routes/lands'));
  api.use('/investments', require('./routes/investments'));
  api.use('/societies', require('./routes/societies'));
  api.use('/plots', require('./routes/plots'));
  api.use('/customers', require('./routes/customers'));
  api.use('/documents', require('./routes/documents'));
  api.use('/bookings', require('./routes/bookings'));
  api.use('/payments', require('./routes/payments'));
  api.use('/transfers', require('./routes/transfers'));
  api.use('/expenses', require('./routes/expenses'));
  api.use('/reports', require('./routes/reports'));
  api.use('/backup', require('./routes/backup'));
  api.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use('/api', api);

  // Local development only: serve the built React app (on Vercel the web app is served by Vercel itself).
  if (!config.onVercel && fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '7d', setHeaders: (res, p) => { if (p.endsWith('.html')) res.set('Cache-Control', 'no-cache'); } }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(config.clientDist, 'index.html'));
    });
  }
  app.use(errorHandler);
  return app;
}
module.exports = { createApp };
