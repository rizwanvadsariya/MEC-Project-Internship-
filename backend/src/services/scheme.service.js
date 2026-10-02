/**
 * Scheme list/filter/detail; applies the division-scope join for RD/DG (schema.md §5); owns physical_progress_pct rollup writes.
 * Business logic only — no HTTP objects, no raw SQL. Calls repositories/ for
 * data and other services/ for cross-cutting actions. Unit-testable in isolation.
 */
'use strict';

const schemeRepo = require('../repositories/scheme.repo');
const dashboardRepo = require('../repositories/dashboard.repo');
const { HIGH_VALUE_ROLES } = require('../constants/roles');
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

/** Step 28 — QR scan-to-open. Same open, province-wide access as getById
 *  above (this app's scheme browsing has no division restriction, Step 7) —
 *  a scanned code opens exactly what browsing to that scheme would show. */
async function getByUid(user, uid) {
	const scheme = await schemeRepo.findByUid(uid);
	if (!scheme) throw ApiError.notFound('Scheme not found');
	return scheme;
}

async function getFilterOptions() {
	return schemeRepo.filterOptions();
}

/**
 * Step 30 — GIS map view. Division/district progress rollups are
 * province-wide open data for any authenticated role (the same figures the
 * scheme browser already exposes to everyone, Step 7) — no new access is
 * granted here. The issue-severity coloring layer is a different matter: it
 * surfaces an open-issue count per district, which this app has only ever
 * exposed to RD/DG and only for their own division (Steps 16/23) — so it's
 * added here under the identical restriction rather than opened
 * province-wide, and simply omitted (an empty array, not a 403) for every
 * other role so the base map — progress-only — still works for everyone.
 */
async function getMapSummary(actor) {
	const [divisions, districts] = await Promise.all([
		schemeRepo.mapDivisionSummary(),
		schemeRepo.mapDistrictSummary(),
	]);

	let issuesByDistrict = [];
	if (HIGH_VALUE_ROLES.includes(actor.role) && (actor.divisionIds?.length || actor.divisionId != null)) {
		issuesByDistrict = await dashboardRepo.countIssuesByDistrict(actor.divisionIds?.length ? actor.divisionIds : actor.divisionId);
	}

	return { divisions, districts, issuesByDistrict };
}

module.exports = { list, getById, getByUid, getFilterOptions, getMapSummary };
