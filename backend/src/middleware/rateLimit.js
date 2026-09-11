/**
 * Per-IP limiters; tighter buckets for auth and provisioning than for general
 * read/write routes (architecture.md §4.7). Two auth-adjacent limiters are
 * deliberately separate (hardening points #5 vs #8): someone spamming
 * *account creation* and someone spamming *login guesses* are different
 * threats and shouldn't share a budget. This is IP-level throttling only —
 * per-account login lockout is tracked in the DB by services/auth.service.js.
 */
'use strict';

const rateLimit = require('express-rate-limit');
const { config } = require('../config');
const ApiError = require('../lib/ApiError');

function handler(_req, _res, next) {
  next(ApiError.tooManyRequests('Too many requests, please try again later', 'RATE_LIMITED'));
}

function make(max) {
  return rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler,
  });
}

module.exports = {
  readLimiter: make(config.RATE_LIMIT_MAX_READ),
  writeLimiter: make(config.RATE_LIMIT_MAX_WRITE),
  /** POST /auth/login, POST /auth/forgot-password. */
  loginLimiter: make(config.RATE_LIMIT_MAX_AUTH),
  /** POST /auth/users — account provisioning only. */
  provisionLimiter: make(config.RATE_LIMIT_MAX_PROVISION),
};
