/**
 * Scheme list/filter/detail; applies the division-scope join for RD/DG (schema.md §5); owns physical_progress_pct rollup writes.
 * Business logic only — no HTTP objects, no raw SQL. Calls repositories/ for
 * data and other services/ for cross-cutting actions. Unit-testable in isolation.
 */
'use strict';
module.exports = {};
