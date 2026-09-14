/**
 * Scheme list/filter/detail; applies the division-scope join for RD/DG (schema.md §5); owns physical_progress_pct rollup writes.
 * Business logic only — no HTTP objects, no raw SQL. Calls repositories/ for
 * data and other services/ for cross-cutting actions. Unit-testable in isolation.
 */
'use strict';

const schemeRepo = require('../repositories/scheme.repo');
const ApiError = require('../lib/ApiError');

async function list(filters) {
	// The Phase 1 browser is intentionally province-wide. Users can still use
	// the explicit division filter to narrow the register without hiding valid
	// schemes from UID searches.
	return schemeRepo.list(filters);
}

async function getById(user, id) {
	const scheme = await schemeRepo.findById(id);
	if (!scheme) throw ApiError.notFound('Scheme not found');
	return scheme;
}

async function getFilterOptions() {
	return schemeRepo.filterOptions();
}

module.exports = { list, getById, getFilterOptions };
