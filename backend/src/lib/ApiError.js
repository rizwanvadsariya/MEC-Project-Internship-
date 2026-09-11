/**
 * Typed operational error: statusCode + client-safe message + optional details
 * + an optional machine-readable `code` (e.g. "MFA_REQUIRED", "ACCOUNT_LOCKED")
 * so a client can branch on a stable string instead of parsing message text.
 */
'use strict';

class ApiError extends Error {
  constructor(statusCode, message, details, code) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.code = code;
    this.expected = true;
  }

  static badRequest(msg = 'Bad request', details, code) { return new ApiError(400, msg, details, code); }
  static unauthorized(msg = 'Unauthorized', code) { return new ApiError(401, msg, undefined, code); }
  static forbidden(msg = 'Forbidden', code) { return new ApiError(403, msg, undefined, code); }
  static notFound(msg = 'Not found', code) { return new ApiError(404, msg, undefined, code); }
  static conflict(msg = 'Conflict', details, code) { return new ApiError(409, msg, details, code); }
  static tooManyRequests(msg = 'Too many requests', code) { return new ApiError(429, msg, undefined, code); }
}

module.exports = ApiError;
