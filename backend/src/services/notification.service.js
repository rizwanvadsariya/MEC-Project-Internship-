/**
 * Build notification rows and hand push fan-out to the background job queue (never inline).
 * Business logic only — no HTTP objects, no raw SQL. Calls repositories/ for
 * data and other services/ for cross-cutting actions. Unit-testable in isolation.
 */
'use strict';
module.exports = {};
