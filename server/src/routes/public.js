'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const settings = require('../lib/settings');

const router = express.Router();
// Non-sensitive branding needed on the login screen.
router.get('/branding', async (_req, res) => {
  const c = await settings.get('company');
  res.json({ name: c.name || 'FAISAL HOMES', tagline: c.tagline || '', hasLogo: !!findLogo() });
});
function findLogo() {
  const dir = path.join(config.uploadDir, 'branding');
  if (!fs.existsSync(dir)) return null;
  const f = fs.readdirSync(dir).find((x) => x.startsWith('logo.'));
  return f ? path.join(dir, f) : null;
}
router.get('/logo', (_req, res) => {
  const f = findLogo();
  if (!f) return res.status(404).end();
  res.set('Cache-Control', 'no-cache');
  res.sendFile(f);
});
module.exports = router;
module.exports.findLogo = findLogo;
