/**
 * Login, token refresh, current-user profile. Stricter rate limits (architecture.md §4.7).
 * Routes only: HTTP verb + path -> middleware (authenticate, authorize(roles),
 * validate(schema)) -> controller method. No logic here.
 */
'use strict';
const router = require('express').Router();
// TODO: define routes
module.exports = router;
