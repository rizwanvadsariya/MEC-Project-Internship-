/**
 * Single centralized error formatter. Expected errors (ApiError) return their
 * status + client-safe message; anything else becomes a generic 500 and the real
 * error goes to the server log only — never a stack trace / SQL text / path to
 * the client (architecture.md §4.10).
 */
'use strict';

const logger = require('../lib/logger');
const ApiError = require('../lib/ApiError');

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        ...(err.code ? { code: err.code } : {}),
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  logger.error({ err, reqId: req.id, path: req.path }, 'unhandled error');
  return res.status(500).json({ error: { message: 'Internal server error' } });
};
