/**
 * GET /api/v1/health — liveness + DB connectivity probe for Render
 * (architecture.md §6). Public (no auth).
 */
'use strict';

const router = require('express').Router();
const { ping } = require('../../../config/database');
const asyncHandler = require('../../../lib/asyncHandler');
const logger = require('../../../lib/logger');

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    try {
      const dbTime = await ping();
      res.json({ status: 'ok', db: 'up', dbTime, uptime: process.uptime() });
    } catch (err) {
      // Driver error text can contain connection-string or SQL details, so it
      // stays in the server log and the public response stays generic.
      logger.error({ err }, 'health check: database ping failed');
      res.status(503).json({ status: 'degraded', db: 'down' });
    }
  }),
);

module.exports = router;
