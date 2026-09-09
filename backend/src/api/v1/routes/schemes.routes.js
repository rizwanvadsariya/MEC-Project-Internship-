/**
 * Read-only ADP scheme browser: list/filter by division, district, department, sub_sector, status; scheme detail. No create/update path (schema.md §6.3).
 * Routes only: HTTP verb + path -> middleware (authenticate, authorize(roles),
 * validate(schema)) -> controller method. No logic here.
 */
'use strict';
const router = require('express').Router();
// TODO: define routes
module.exports = router;
