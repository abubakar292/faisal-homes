'use strict';
// Non-sensitive information needed before login: branding for the login screen and the public
// Supabase settings the web app uses to sign in (the URL and the publishable/anon key are public).
const express = require('express');
const config = require('../config');
const settings = require('../lib/settings');
const supa = require('../lib/supabase');

const router = express.Router();

router.get('/config', (_req, res) => {
  res.json({ supabaseUrl: config.supabaseUrl, supabaseAnonKey: config.supabaseAnonKey });
});

router.get('/branding', async (_req, res) => {
  const c = await settings.get('company');
  const b = await settings.get('branding');
  res.json({ name: c.name || 'FAISAL HOMES', tagline: c.tagline || '', hasLogo: !!b.logo_path, logoVersion: b.logo_version || 0 });
});

// Company logo, kept in Supabase Storage. Cached in memory per logo version.
let logoCache = { key: null, buf: null, mime: null };
async function getLogo() {
  const b = await settings.get('branding');
  if (!b.logo_path) return null;
  const key = `${b.logo_path}#${b.logo_version || 0}`;
  if (logoCache.key !== key) {
    const buf = await supa.downloadObject(b.logo_path);
    logoCache = { key, buf, mime: b.logo_mime || 'image/png' };
  }
  return logoCache.buf ? logoCache : null;
}

router.get('/logo', async (_req, res) => {
  const logo = await getLogo();
  if (!logo) return res.status(404).end();
  res.set('Content-Type', logo.mime);
  res.set('Cache-Control', 'public, max-age=300');
  res.send(logo.buf);
});

module.exports = router;
module.exports.getLogo = async () => (await getLogo())?.buf || null;
