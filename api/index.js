'use strict';
// Vercel serverless function: every /api/* request is handled by the FAISAL HOMES Express API.
// (vercel.json rewrites /api/* to this file; the web app itself is the static build in dist/.)
let app = null;
let startupError = null;
try {
  app = require('../server/src/app').createApp();
} catch (e) {
  startupError = e;
  console.error('[startup] FAISAL HOMES API could not start:', e);
}

module.exports = (req, res) => {
  if (app) return app(req, res);
  // Show a short reason instead of a bare crash; the full error is in the Vercel function logs.
  res.statusCode = 500;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    error: 'The FAISAL HOMES server could not start. Open Vercel → Logs for details.',
    code: 'STARTUP_FAILED',
    reason: startupError && (startupError.code || startupError.name),
  }));
};
