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
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: { 'img-src': ["'self'", 'data:', 'blob:'], 'upgrade-insecure-requests': null, 'frame-src': ["'self'", 'blob:'], 'object-src': ["'self'"] },
    },
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: config.cookieSecure,
  }));
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  api.use(csrfGuard);
  api.use(loadUser);
  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.use('/auth', require('./routes/auth'));
  api.use('/public', require('./routes/public'));
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

  // Serve the built React app.
  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '7d', setHeaders: (res, p) => { if (p.endsWith('.html')) res.set('Cache-Control', 'no-cache'); } }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(config.clientDist, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => res.send('FAISAL HOMES API is running. Build the client (npm run build) to use the web interface.'));
  }
  app.use(errorHandler);
  return app;
}
module.exports = { createApp };
