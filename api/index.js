'use strict';
// Vercel serverless function: every /api/* request is handled by the FAISAL HOMES Express API.
// (vercel.json rewrites /api/* to this file; the web app itself is the static build of client/.)
const { createApp } = require('../server/src/app');

module.exports = createApp();
