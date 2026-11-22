'use strict';
const express = require('express');
const { requirePerm } = require('../middleware/auth');
const { runReport, REPORT_NAMES } = require('../services/reportService');
const { reportToXlsx } = require('../lib/excel');
const { sendReportPdf } = require('../lib/pdf');
const { maskFor } = require('../lib/mask');
const settings = require('../lib/settings');
const { audit } = require('../lib/audit');

const router = express.Router();
router.use(requirePerm('report.view'));

router.get('/', (_req, res) => res.json(REPORT_NAMES));

router.get('/:name', async (req, res) => {
  const rep = await runReport(req.params.name, req.query);
  if (rep.subtitle && req.user.role === 'VIEWER') rep.subtitle = rep.subtitle.replace(/CNIC (\d{5})-\d{7}-(\d)/, 'CNIC $1-*******-$2');
  const fmt = req.query.format;
  const base = `${rep.title.replace(/[^a-z0-9]+/gi, '-')}-${new Date().toISOString().slice(0, 10)}`;
  if (fmt === 'xlsx') {
    const company = (await settings.get('company')).name || 'FAISAL HOMES';
    const buf = await reportToXlsx(rep, company);
    await audit(null, req, { action: 'EXPORT', entity: 'report', entityId: req.params.name, summary: `Exported ${rep.title} to Excel` });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
    return res.send(Buffer.from(buf));
  }
  if (fmt === 'pdf') {
    await audit(null, req, { action: 'EXPORT', entity: 'report', entityId: req.params.name, summary: `Exported ${rep.title} to PDF` });
    return sendReportPdf(res, `${base}.pdf`, rep, req.query.download);
  }
  delete rep.customer;
  res.json(maskFor(req, rep));
});

module.exports = router;
