/**
 * schemes + scheme_districts + financial_year_allocations + revision_history reads.
 * The ONLY layer that talks to Postgres/Supabase. Parameterized queries, proper
 * joins (no N+1), cursor pagination on lists (architecture.md §5.1/§5.3).
 */
'use strict';

const db = require('../config/database');

function buildWhere(filters, params) {
	const clauses = [];
	const add = (clause, values) => {
		for (const value of values) params.push(value);
		let index = params.length - values.length;
		clauses.push(clause.replace(/\?/g, () => `$${++index}`));
	};

	if (filters.search) add('(s.uid ILIKE ? OR s.name ILIKE ?)', [`%${filters.search}%`, `%${filters.search}%`]);
	if (filters.departmentId) add('s.department_id = ?', [filters.departmentId]);
	if (filters.subSectorId) add('s.sub_sector_id = ?', [filters.subSectorId]);
	if (filters.status) add('s.status = ?', [filters.status]);
	if (filters.districtId) add('exists (select 1 from scheme_districts sd_filter where sd_filter.scheme_id = s.id and sd_filter.district_id = ?)', [filters.districtId]);
	if (filters.divisionId) add('exists (select 1 from scheme_districts sd_division join districts d_division on d_division.id = sd_division.district_id where sd_division.scheme_id = s.id and d_division.division_id = ?)', [filters.divisionId]);
	if (filters.scopeDivisionId) add('exists (select 1 from scheme_districts sd_scope join districts d_scope on d_scope.id = sd_scope.district_id where sd_scope.scheme_id = s.id and d_scope.division_id = ?)', [filters.scopeDivisionId]);
	if (filters.cursor) add('s.id < ?', [filters.cursor]);
	return clauses.length ? `where ${clauses.join(' and ')}` : '';
}

const select = `
	select s.id, s.uid, s.gen_sr_no as "genSrNo", s.name, s.status,
		s.department_id as "departmentId", dep.name as "departmentName",
		s.sub_sector_id as "subSectorId", ss.name as "subSectorName",
		s.target_completion_date as "targetCompletionDate", s.estimated_cost as "estimatedCost",
		s.physical_progress_pct::float8 as "physicalProgressPct", s.financial_progress_pct::float8 as "financialProgressPct",
		coalesce(array_agg(distinct d.name) filter (where d.id is not null), '{}') as districts,
		coalesce(array_agg(distinct div.name) filter (where div.id is not null), '{}') as divisions
	from schemes s
	join departments dep on dep.id = s.department_id
	left join sub_sectors ss on ss.id = s.sub_sector_id
	left join scheme_districts sd on sd.scheme_id = s.id
	left join districts d on d.id = sd.district_id
	left join divisions div on div.id = d.division_id
`;

async function list(filters) {
	const params = [];
	const limit = Number.isInteger(filters.limit) ? filters.limit : 20;
	const where = buildWhere(filters, params);
	params.push(limit + 1);
	const result = await db.query(`${select} ${where} group by s.id, dep.name, ss.name order by s.id desc limit $${params.length}`, params);
	const hasMore = result.rows.length > limit;
	const rows = result.rows.slice(0, limit);
	return { rows, nextCursor: hasMore && rows.length ? String(rows[rows.length - 1].id) : null };
}

async function findById(id, scopeDivisionId) {
	const params = [id];
	const scope = scopeDivisionId ? 'and exists (select 1 from scheme_districts sd_scope join districts d_scope on d_scope.id = sd_scope.district_id where sd_scope.scheme_id = s.id and d_scope.division_id = $2)' : '';
	if (scopeDivisionId) params.push(scopeDivisionId);
	const result = await db.query(`${select} where s.id = $1 ${scope} group by s.id, dep.name, ss.name`, params);
	return result.rows[0] || null;
}

/**
 * Step 28 — QR scan-to-open resolves a scanned code to a scheme by its `uid`,
 * the same natural, human-readable key printed-on-paper QR codes would
 * realistically encode (schema.md §4.1's own "natural idempotency key" —
 * there's no dedicated QR/barcode column anywhere in the ADP source CSVs to
 * use instead). Case-insensitive and trimmed: a camera scan or a manually
 * retyped code shouldn't fail over a stray space or a lowercase letter.
 */
async function findByUid(uid) {
	const result = await db.query(`${select} where upper(s.uid) = upper($1) group by s.id, dep.name, ss.name`, [uid.trim()]);
	return result.rows[0] || null;
}

/**
 * Step 30 — GIS map view, district granularity. A scheme can span multiple
 * districts (scheme_districts has no unique-per-scheme constraint), and
 * that's the correct, desired behavior here: each district tile on the map
 * reports progress for the schemes physically linked to it, so a
 * multi-district scheme legitimately contributes to more than one tile.
 * `scheme_districts`'s own primary key is (scheme_id, district_id), so a
 * scheme can only ever join to a given district once — no double-counting
 * risk within a single district's own aggregate.
 */
async function mapDistrictSummary() {
	const { rows } = await db.query(`
		select d.id as "districtId", d.name as "districtName", d.division_id as "divisionId",
			count(distinct s.id)::int as "schemesTotal",
			count(distinct s.id) filter (where s.physical_progress_pct is not null)::int as "schemesReported",
			avg(s.physical_progress_pct)::float8 as "avgPhysicalProgressPct"
		from districts d
		left join scheme_districts sd on sd.district_id = d.id
		left join schemes s on s.id = sd.scheme_id
		group by d.id, d.name, d.division_id
		order by d.name
	`);
	return rows;
}

/**
 * Division-level rollup for the same map. Unlike the district query above,
 * a scheme spanning two districts *within the same division* must only be
 * counted once at the division level — the exact double-counting trap
 * Step 23 already documented hitting in its own test fixture. The CTE
 * de-duplicates (scheme_id, division_id) pairs before aggregating, so a
 * scheme's progress is never double-weighted into one division's average
 * just because it touches two of that division's districts.
 */
async function mapDivisionSummary() {
	const { rows } = await db.query(`
		with scheme_division as (
			select distinct s.id as scheme_id, s.physical_progress_pct, d.division_id
			from schemes s
			join scheme_districts sd on sd.scheme_id = s.id
			join districts d on d.id = sd.district_id
		)
		select dv.id as "divisionId", dv.name as "divisionName",
			count(sdv.scheme_id)::int as "schemesTotal",
			count(sdv.scheme_id) filter (where sdv.physical_progress_pct is not null)::int as "schemesReported",
			avg(sdv.physical_progress_pct)::float8 as "avgPhysicalProgressPct"
		from divisions dv
		left join scheme_division sdv on sdv.division_id = dv.id
		group by dv.id, dv.name
		order by dv.name
	`);
	return rows;
}

async function filterOptions() {
	const [divisions, districts, departments, subSectors, statuses] = await Promise.all([
		db.query('select id, name from divisions order by name'),
		db.query('select id, division_id as "divisionId", name from districts order by name'),
		db.query('select id, name from departments order by name'),
		db.query('select id, department_id as "departmentId", name from sub_sectors order by name'),
		db.query("select distinct status from schemes where status is not null and status <> '' order by status"),
	]);
	return {
		divisions: divisions.rows,
		districts: districts.rows,
		departments: departments.rows,
		subSectors: subSectors.rows,
		statuses: statuses.rows.map((row) => row.status),
	};
}

module.exports = { list, findById, findByUid, filterOptions, mapDistrictSummary, mapDivisionSummary };
