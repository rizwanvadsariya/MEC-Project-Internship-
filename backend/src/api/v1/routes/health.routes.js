/**
 * GET /api/v1/health — liveness + DB connectivity probe for Render
 * (architecture.md §6). Public (no auth).
 */
'use strict';

const router = require('express').Router();
const { ping } = require('../../../config/database');
const asyncHandler = require('../../../lib/asyncHandler');

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    try {
      const dbTime = await ping();
      res.json({ status: 'ok', db: 'up', dbTime, uptime: process.uptime() });
    } catch (err) {
      res.status(503).json({ status: 'degraded', db: 'down', error: err.message });
    }
  }),
);

module.exports = router;
