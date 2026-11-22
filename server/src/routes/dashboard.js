'use strict';
const express = require('express');
const { can } = require('../lib/permissions');
const { dashboard } = require('../services/reportService');

const router = express.Router();
router.get('/', async (req, res) => {
  const d = await dashboard();
  if (!can(req.user.role, 'dashboard.finance')) {
    // Sales staff see inventory and customer counts but not company financials.
    delete d.finance; delete d.months; delete d.recent_payments;
  }
  res.json(d);
});
module.exports = router;
