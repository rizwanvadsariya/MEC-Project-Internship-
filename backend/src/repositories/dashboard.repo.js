/**
 * Division-scoped rollups (RD/DG) and team-membership-scoped rollups
 * (MEO/Support) over visit_teams / site_visits / visit_forms / issue_reports
 * for the dashboards. The ONLY layer that talks to Postgres/Supabase.
 * Parameterized queries, proper joins (no N+1).
 */
'use strict';

const db = require('../config/database');

/** Actor is a member (any team_role) of the visit's team — same membership
 *  test siteVisit.repo/visitForm.repo/issue.repo already use for MEO/Support
 *  read access. */
const ACTOR_IS_MEMBER = `exists (
	select 1 from visit_team_members vtm
	where vtm.team_id = %TEAM_ID% and vtm.user_id = $1
)`;

/** Actor is specifically the LEAD_MEO of the visit's team — the only role
 *  that can fill the form / file issues, so "my reported issues" and
 *  "forms due" are both scoped through this. */
const ACTOR_IS_LEAD = `exists (
	select 1 from visit_team_members vtm
	where vtm.team_id = %TEAM_ID% and vtm.user_id = $1 and vtm.team_role = 'LEAD_MEO'
)`;

/**
 * A scheme is "in the caller's division" if any of its linked districts
 * belongs to that division — the same EXISTS pattern approval.repo and
 * siteVisit.repo use, so a scheme spanning multiple districts in one
 * division is still counted once per team/visit/issue row.
 */
const SCHEME_IN_DIVISION = `exists (
	select 1 from scheme_districts sd
	join districts d on d.id = sd.district_id
	where sd.scheme_id = %SCHEME_ID% and d.division_id = $1
)`;

async function findDivision(divisionId) {
	const { rows } = await db.query(`select id, name from divisions where id = $1`, [divisionId]);
	return rows[0] || null;
}

async function countTeamsByStatus(divisionId) {
	const { rows } = await db.query(
		`select status, count(*)::int as count
		 from visit_teams vt
		 where ${SCHEME_IN_DIVISION.replace('%SCHEME_ID%', 'vt.scheme_id')}
		 group by status`,
		[divisionId],
	);
	return rows;
}

async function countVisitsByStatus(divisionId) {
	const { rows } = await db.query(
		`select status, count(*)::int as count
		 from site_visits sv
		 where ${SCHEME_IN_DIVISION.replace('%SCHEME_ID%', 'sv.scheme_id')}
		 group by status`,
		[divisionId],
	);
	return rows;
}

async function countIssuesByStatusAndSeverity(divisionId) {
	const { rows } = await db.query(
		`select ir.status, ir.severity, count(*)::int as count
		 from issue_reports ir
		 join site_visits sv on sv.id = ir.site_visit_id
		 where ${SCHEME_IN_DIVISION.replace('%SCHEME_ID%', 'sv.scheme_id')}
		 group by ir.status, ir.severity`,
		[divisionId],
	);
	return rows;
}

async function listRecentVisits(divisionId, limit) {
	const { rows } = await db.query(
		`select sv.id, sv.status, sv.scheduled_date as "scheduledDate", sv.created_at as "createdAt",
				s.uid as "schemeUid", s.name as "schemeName"
		 from site_visits sv
		 join schemes s on s.id = sv.scheme_id
		 where ${SCHEME_IN_DIVISION.replace('%SCHEME_ID%', 'sv.scheme_id')}
		 order by sv.created_at desc
		 limit $2`,
		[divisionId, limit],
	);
	return rows;
}

/**
 * One row per department that has at least one scheme in the division —
 * schemesTotal/schemesReported/avgProgressPct for the "progress % by
 * department" analytics (Step 23). avg()/count() already ignore NULLs, and
 * avg() returns SQL NULL (-> JS null once cast) when a department has zero
 * reported schemes, which is the correct "no data yet" signal — never
 * coalesced to 0, per the numeric-as-string cast convention (Steps 19/21),
 * avgProgressPct is cast to ::float8 in the SQL itself.
 */
async function countProgressByDepartment(divisionId) {
	const { rows } = await db.query(
		`select dep.id as "departmentId", dep.name as "departmentName",
				count(s.id)::int as "schemesTotal",
				count(s.id) filter (where s.physical_progress_pct is not null)::int as "schemesReported",
				avg(s.physical_progress_pct)::float8 as "avgProgressPct"
		 from schemes s
		 join departments dep on dep.id = s.department_id
		 where ${SCHEME_IN_DIVISION.replace('%SCHEME_ID%', 's.id')}
		 group by dep.id, dep.name
		 order by dep.name`,
		[divisionId],
	);
	return rows;
}

async function listRecentOpenIssues(divisionId, limit) {
	const { rows } = await db.query(
		`select ir.id, ir.site_visit_id as "siteVisitId", ir.issue_type as "issueType",
				ir.severity, ir.status, ir.created_at as "createdAt",
				s.uid as "schemeUid", s.name as "schemeName"
		 from issue_reports ir
		 join site_visits sv on sv.id = ir.site_visit_id
		 join schemes s on s.id = sv.scheme_id
		 where ir.status <> 'RESOLVED' and ${SCHEME_IN_DIVISION.replace('%SCHEME_ID%', 'sv.scheme_id')}
		 order by ir.created_at desc
		 limit $2`,
		[divisionId, limit],
	);
	return rows;
}

async function countVisitsByStatusForMember(userId) {
	const { rows } = await db.query(
		`select status, count(*)::int as count
		 from site_visits sv
		 where ${ACTOR_IS_MEMBER.replace('%TEAM_ID%', 'sv.team_id')}
		 group by status`,
		[userId],
	);
	return rows;
}

/**
 * "Forms due" for a lead MEO: visits they lead that either have no
 * visit_forms row yet (not started) or one still in DRAFT — i.e. their
 * actual remaining fieldwork. Always 0 for an actor who is never a
 * LEAD_MEO (e.g. every SUPPORT_USER), with no special-casing needed.
 */
async function countFormsDueForLead(userId) {
	const { rows } = await db.query(
		`select count(*)::int as count
		 from site_visits sv
		 left join visit_forms vf on vf.site_visit_id = sv.id
		 where ${ACTOR_IS_LEAD.replace('%TEAM_ID%', 'sv.team_id')}
			 and (vf.id is null or vf.status = 'DRAFT')`,
		[userId],
	);
	return rows[0].count;
}

async function countIssuesReportedByActor(userId) {
	const { rows } = await db.query(`select count(*)::int as count from issue_reports where reported_by = $1`, [userId]);
	return rows[0].count;
}

/**
 * Open issues the actor may actually see: on a visit they're a member of,
 * and — mirroring visitForm.service/issue.service's Step 15 rule — only
 * once the report is SUBMITTED, unless the actor is that visit's own lead
 * MEO (who always sees their own in-progress work). Pushes a second copy of
 * userId onto params (the membership check already consumed the first) and
 * returns the clause referencing that new placeholder.
 */
function visibleIssueClause(userId, params) {
	params.push(userId);
	const leadUserIdx = params.length;
	return `(
		exists (
			select 1 from visit_team_members vtm
			where vtm.team_id = sv.team_id and vtm.user_id = $${leadUserIdx} and vtm.team_role = 'LEAD_MEO'
		)
		or coalesce(vf.status = 'SUBMITTED', false)
	)`;
}

async function countVisibleOpenIssuesForMember(userId) {
	const params = [userId];
	const visible = visibleIssueClause(userId, params);
	const { rows } = await db.query(
		`select count(*)::int as count
		 from issue_reports ir
		 join site_visits sv on sv.id = ir.site_visit_id
		 left join visit_forms vf on vf.site_visit_id = sv.id
		 where ir.status <> 'RESOLVED'
			 and ${ACTOR_IS_MEMBER.replace('%TEAM_ID%', 'sv.team_id')}
			 and ${visible}`,
		params,
	);
	return rows[0].count;
}

async function countDistinctSchemesForMember(userId) {
	const { rows } = await db.query(
		`select count(distinct sv.scheme_id)::int as count
		 from site_visits sv
		 where ${ACTOR_IS_MEMBER.replace('%TEAM_ID%', 'sv.team_id')}`,
		[userId],
	);
	return rows[0].count;
}

async function listRecentVisitsForMember(userId, limit) {
	const { rows } = await db.query(
		`select sv.id, sv.status, sv.scheduled_date as "scheduledDate", sv.created_at as "createdAt",
				s.uid as "schemeUid", s.name as "schemeName"
		 from site_visits sv
		 join schemes s on s.id = sv.scheme_id
		 where ${ACTOR_IS_MEMBER.replace('%TEAM_ID%', 'sv.team_id')}
		 order by sv.created_at desc
		 limit $2`,
		[userId, limit],
	);
	return rows;
}

async function listRecentVisibleIssuesForMember(userId, limit) {
	const params = [userId];
	const visible = visibleIssueClause(userId, params);
	params.push(limit);
	const limitIdx = params.length;
	const { rows } = await db.query(
		`select ir.id, ir.site_visit_id as "siteVisitId", ir.issue_type as "issueType",
				ir.severity, ir.status, ir.created_at as "createdAt",
				s.uid as "schemeUid", s.name as "schemeName"
		 from issue_reports ir
		 join site_visits sv on sv.id = ir.site_visit_id
		 join schemes s on s.id = sv.scheme_id
		 left join visit_forms vf on vf.site_visit_id = sv.id
		 where ir.status <> 'RESOLVED'
			 and ${ACTOR_IS_MEMBER.replace('%TEAM_ID%', 'sv.team_id')}
			 and ${visible}
		 order by ir.created_at desc
		 limit $${limitIdx}`,
		params,
	);
	return rows;
}

/**
 * Step 27 — physical vs. financial progress reconciliation. Both percentages
 * already live directly on `schemes` (physical_progress_pct is the app's own
 * rollup from visit_forms, per Step 23; financial_progress_pct comes from the
 * ADP booklet import and is never written by the app — schema.md §4.1) — no
 * new columns needed, only a query that compares them. `gap` is
 * financial - physical: positive means money is reported spent ahead of
 * field-verified physical work (the concerning direction for oversight),
 * negative means the reverse. Only schemes where BOTH values are known are
 * ever included — there's nothing to reconcile otherwise, and
 * countProgressReconciliationSummary reports how many schemes that excludes.
 * WHERE can't reference a SELECT-list alias in Postgres, so PHYSICAL/FINANCIAL/
 * GAP/ABS_GAP are repeated as raw expressions everywhere they're needed
 * (select, filter, cursor, order by) rather than referenced by alias.
 */
const PHYSICAL_PCT = 's.physical_progress_pct::float8';
const FINANCIAL_PCT = 's.financial_progress_pct::float8';
const GAP_EXPR = `(${FINANCIAL_PCT} - ${PHYSICAL_PCT})`;
const ABS_GAP_EXPR = `abs(${GAP_EXPR})`;
const BOTH_VALUES_KNOWN = 's.physical_progress_pct is not null and s.financial_progress_pct is not null';

async function countProgressReconciliationSummary(divisionId, flagThresholdPct) {
	const { rows } = await db.query(
		`select
				count(*)::int as "schemesTotal",
				count(*) filter (where ${BOTH_VALUES_KNOWN})::int as "schemesWithBothValues",
				count(*) filter (where ${BOTH_VALUES_KNOWN} and ${ABS_GAP_EXPR} >= $2)::int as "schemesFlagged"
		 from schemes s
		 where ${SCHEME_IN_DIVISION.replace('%SCHEME_ID%', 's.id')}`,
		[divisionId, flagThresholdPct],
	);
	return rows[0];
}

/**
 * Biggest divergence first (abs(gap) desc) — the whole point of an oversight
 * list like this is surfacing the worst mismatches, not an arbitrary order.
 * `(abs_gap, id)` composite cursor, same shape as every other keyset-paginated
 * list in this app, tie-broken by id since abs(gap) alone isn't unique.
 */
async function listProgressReconciliation(divisionId, filters) {
	const params = [divisionId];
	const clauses = [SCHEME_IN_DIVISION.replace('%SCHEME_ID%', 's.id'), BOTH_VALUES_KNOWN];

	if (filters.minGap != null) {
		params.push(filters.minGap);
		clauses.push(`${ABS_GAP_EXPR} >= $${params.length}`);
	}
	if (filters.cursor) {
		params.push(filters.cursor.absGap);
		const absGapIdx = params.length;
		params.push(filters.cursor.id);
		const idIdx = params.length;
		clauses.push(`(${ABS_GAP_EXPR}, s.id) < ($${absGapIdx}, $${idIdx})`);
	}

	const limit = Number.isInteger(filters.limit) ? filters.limit : 20;
	params.push(limit + 1);

	const result = await db.query(
		`select s.id, s.uid, s.name, dep.name as "departmentName",
				${PHYSICAL_PCT} as "physicalProgressPct", ${FINANCIAL_PCT} as "financialProgressPct",
				${GAP_EXPR} as "gap"
		 from schemes s
		 join departments dep on dep.id = s.department_id
		 where ${clauses.join(' and ')}
		 order by ${ABS_GAP_EXPR} desc, s.id desc
		 limit $${params.length}`,
		params,
	);

	const hasMore = result.rows.length > limit;
	const rows = result.rows.slice(0, limit);
	const last = rows[rows.length - 1];
	return {
		rows,
		nextCursor: hasMore && last ? `${Math.abs(last.gap)}_${last.id}` : null,
	};
}

/**
 * Step 31 — delay/anomaly detection, "no visit in X months." A scheme's
 * last visit is the most recent COMPLETED site_visit's completed_at — a
 * SCHEDULED/IN_PROGRESS visit that never finished isn't evidence anyone
 * actually monitored the scheme, so it doesn't count as "recent activity"
 * any more than no visit at all. A scheme with no completed visit ever
 * (`lastVisitDate` null) is the most severe case and sorts first
 * (`nulls first`), then oldest-completed-visit-first.
 */
async function listNoRecentVisitSchemes(divisionId, thresholdMonths, limit) {
	const { rows } = await db.query(
		`with last_completed_visit as (
			select sv.scheme_id, max(sv.completed_at) as last_visit_date
			from site_visits sv
			where sv.status = 'COMPLETED'
			group by sv.scheme_id
		)
		select s.id, s.uid, s.name, dep.name as "departmentName",
				lcv.last_visit_date as "lastVisitDate"
		 from schemes s
		 join departments dep on dep.id = s.department_id
		 left join last_completed_visit lcv on lcv.scheme_id = s.id
		 where ${SCHEME_IN_DIVISION.replace('%SCHEME_ID%', 's.id')}
			 and (lcv.last_visit_date is null or lcv.last_visit_date < now() - ($2 * interval '1 month'))
		 order by lcv.last_visit_date asc nulls first, s.id desc
		 limit $3`,
		[divisionId, thresholdMonths, limit],
	);
	return rows;
}

async function countNoRecentVisitSchemes(divisionId, thresholdMonths) {
	const { rows } = await db.query(
		`with last_completed_visit as (
			select sv.scheme_id, max(sv.completed_at) as last_visit_date
			from site_visits sv
			where sv.status = 'COMPLETED'
			group by sv.scheme_id
		)
		select count(*)::int as count
		 from schemes s
		 left join last_completed_visit lcv on lcv.scheme_id = s.id
		 where ${SCHEME_IN_DIVISION.replace('%SCHEME_ID%', 's.id')}
			 and (lcv.last_visit_date is null or lcv.last_visit_date < now() - ($2 * interval '1 month'))`,
		[divisionId, thresholdMonths],
	);
	return rows[0].count;
}

/**
 * Step 31 — delay/anomaly detection, "spend-without-progress" pattern.
 * Deliberately one-directional and its own, stricter threshold pair rather
 * than reusing Step 27's generic reconciliation gap: a scheme reporting
 * substantial money spent (financial_progress_pct) while physical,
 * field-verified progress stays low is a specific, more alarming signal
 * than an arbitrary divergence in either direction — Step 27's list already
 * covers "any big gap, either direction" as a browsable oversight list;
 * this is a narrower, one-directional anomaly flag.
 */
async function listSpendWithoutProgressSchemes(divisionId, financialMinPct, physicalMaxPct, limit) {
	const { rows } = await db.query(
		`select s.id, s.uid, s.name, dep.name as "departmentName",
				${PHYSICAL_PCT} as "physicalProgressPct", ${FINANCIAL_PCT} as "financialProgressPct"
		 from schemes s
		 join departments dep on dep.id = s.department_id
		 where ${SCHEME_IN_DIVISION.replace('%SCHEME_ID%', 's.id')}
			 and ${BOTH_VALUES_KNOWN}
			 and ${FINANCIAL_PCT} >= $2 and ${PHYSICAL_PCT} <= $3
		 order by (${FINANCIAL_PCT} - ${PHYSICAL_PCT}) desc, s.id desc
		 limit $4`,
		[divisionId, financialMinPct, physicalMaxPct, limit],
	);
	return rows;
}

async function countSpendWithoutProgressSchemes(divisionId, financialMinPct, physicalMaxPct) {
	const { rows } = await db.query(
		`select count(*)::int as count
		 from schemes s
		 where ${SCHEME_IN_DIVISION.replace('%SCHEME_ID%', 's.id')}
			 and ${BOTH_VALUES_KNOWN}
			 and ${FINANCIAL_PCT} >= $2 and ${PHYSICAL_PCT} <= $3`,
		[divisionId, financialMinPct, physicalMaxPct],
	);
	return rows[0].count;
}

/**
 * Step 33 — predictive risk flagging: a scheme "likely to miss" its own
 * target completion date. Deliberately a deterministic, SQL-computable
 * linear-pace projection, not a statistical/ML model — this project has no
 * ML infrastructure anywhere, and the same "documented judgment-call
 * threshold, not a spec" footing as every other Step 25/27/31 rule applies
 * here too: `expectedProgressPct` assumes even, straight-line progress from
 * `date_of_approval` to the target date, which real fieldwork never
 * actually is, but is the simplest honest baseline to flag a real divergence
 * against.
 *
 * `schemes.target_completion_date` is `text`, not a real `date` column — the
 * ADP source only ever gives a month+year target (schema.md §4.1,
 * Memory.md's Key decision #14), consistently formatted "Mon-YY" (e.g.
 * "Jun-27") across 3711 of the real CSV's 3712 rows (surveyed directly
 * against adp-database-seed-csv/schemes.csv, not assumed) — the one
 * exception is blank/NULL, handled by RISK_ELIGIBLE's regex guard below
 * rather than letting a malformed value throw inside to_date(). Interpreted
 * as the *last* day of that month (generous — a scheme isn't overdue until
 * its whole target month has fully elapsed), via a regex-validated
 * `to_date('01-' || target_completion_date, 'DD-Mon-YY')` + roll-to-end-of-
 * month, never a raw cast.
 *
 * A scheme is eligible at all only once it has every input this needs:
 * `date_of_approval` (a real `date` column) and `physical_progress_pct` (the
 * app's own rollup from a real visit report, Step 23) — most schemes in a
 * fresh/early-stage project won't yet, the same "can't be validated on
 * day-one data" situation Steps 31/32 already documented honestly.
 */
const TARGET_DATE_EXPR = `(to_date('01-' || s.target_completion_date, 'DD-Mon-YY') + interval '1 month' - interval '1 day')::date`;
/** `physical_progress_pct < 100` matters here, not just "is not null" — a
 *  scheme already reported fully complete isn't "at risk of missing" its
 *  target in any forward-looking sense even if it happened to finish behind
 *  the original schedule; without this a 100%-complete scheme past its
 *  target date would be flagged as overdue-and-at-risk forever, since the
 *  overdue branch of AT_RISK_CLAUSE doesn't otherwise look at progress. */
const RISK_ELIGIBLE = `
	s.date_of_approval is not null
	and s.target_completion_date ~ '^[A-Za-z]{3}-[0-9]{2}$'
	and s.physical_progress_pct is not null
	and s.physical_progress_pct < 100
	and (${TARGET_DATE_EXPR} - s.date_of_approval) > 0
`;
/** Both sides of this subtraction are `date - date`, which Postgres already
 *  returns as a plain integer day count — no interval/epoch arithmetic
 *  needed, and none of the type-mismatch risk that would come with mixing
 *  `timestamptz` and `date` subtraction. */
const EXPECTED_PROGRESS_EXPR = `greatest(0::float8, least(100::float8,
	((current_date - s.date_of_approval)::float8 / nullif((${TARGET_DATE_EXPR} - s.date_of_approval), 0)::float8) * 100
))`;
const IS_OVERDUE_EXPR = `(${TARGET_DATE_EXPR} < current_date)`;
const PROGRESS_GAP_EXPR = `(${EXPECTED_PROGRESS_EXPR} - s.physical_progress_pct::float8)`;
/** A scheme already past its target date and still incomplete is flagged
 *  regardless of the pace gap (it has, definitionally, already slipped) —
 *  everything else is flagged only once behind-pace by at least the
 *  caller's threshold. */
const AT_RISK_CLAUSE = `(${IS_OVERDUE_EXPR} or ${PROGRESS_GAP_EXPR} >= $2)`;

async function listAtRiskSchemes(divisionId, gapThresholdPct, limit) {
	const { rows } = await db.query(
		`select s.id, s.uid, s.name, dep.name as "departmentName",
				${TARGET_DATE_EXPR} as "targetDate",
				${EXPECTED_PROGRESS_EXPR} as "expectedProgressPct",
				s.physical_progress_pct::float8 as "physicalProgressPct",
				${IS_OVERDUE_EXPR} as "isOverdue"
		 from schemes s
		 join departments dep on dep.id = s.department_id
		 where ${SCHEME_IN_DIVISION.replace('%SCHEME_ID%', 's.id')}
			 and ${RISK_ELIGIBLE}
			 and ${AT_RISK_CLAUSE}
		 order by "isOverdue" desc, ${PROGRESS_GAP_EXPR} desc, s.id desc
		 limit $3`,
		[divisionId, gapThresholdPct, limit],
	);
	return rows;
}

async function countAtRiskSchemes(divisionId, gapThresholdPct) {
	const { rows } = await db.query(
		`select count(*)::int as count
		 from schemes s
		 where ${SCHEME_IN_DIVISION.replace('%SCHEME_ID%', 's.id')}
			 and ${RISK_ELIGIBLE}
			 and ${AT_RISK_CLAUSE}`,
		[divisionId, gapThresholdPct],
	);
	return rows[0].count;
}

/**
 * Step 30 — GIS map view, issue-severity coloring layer. RD/DG only
 * (scheme.service.getMapSummary gates this), scoped to the caller's own
 * division — grouped by district, not division, so a scheme spanning two
 * districts *within that same division* legitimately contributes its issues
 * to both district tiles. That's the opposite of the double-counting trap
 * countProgressByDepartment/mapDivisionSummary have to guard against: this
 * query never rolls the district rows up into one shared division total, so
 * each district's own count stays independently correct no matter how many
 * districts a scheme touches.
 */
async function countIssuesByDistrict(divisionId) {
	const divisionIds = Array.isArray(divisionId) ? divisionId : [divisionId];
	const { rows } = await db.query(
		`select d.id as "districtId", d.name as "districtName",
				count(ir.id) filter (where ir.status <> 'RESOLVED')::int as "openIssues",
				count(ir.id) filter (where ir.status <> 'RESOLVED' and ir.severity = 'CRITICAL')::int as "critical",
				count(ir.id) filter (where ir.status <> 'RESOLVED' and ir.severity = 'HIGH')::int as "high",
				count(ir.id) filter (where ir.status <> 'RESOLVED' and ir.severity = 'MEDIUM')::int as "medium",
				count(ir.id) filter (where ir.status <> 'RESOLVED' and ir.severity = 'LOW')::int as "low"
		 from districts d
		 left join scheme_districts sd on sd.district_id = d.id
		 left join schemes s on s.id = sd.scheme_id
		 left join site_visits sv on sv.scheme_id = s.id
		 left join issue_reports ir on ir.site_visit_id = sv.id
			 where d.division_id = any($1::int[])
		 group by d.id, d.name
		 order by d.name`,
		[divisionIds],
	);
	return rows;
}

module.exports = {
	findDivision,
	countTeamsByStatus,
	countVisitsByStatus,
	countIssuesByStatusAndSeverity,
	countProgressByDepartment,
	listRecentVisits,
	listRecentOpenIssues,
	countVisitsByStatusForMember,
	countFormsDueForLead,
	countIssuesReportedByActor,
	countVisibleOpenIssuesForMember,
	countDistinctSchemesForMember,
	listRecentVisitsForMember,
	listRecentVisibleIssuesForMember,
	countProgressReconciliationSummary,
	listProgressReconciliation,
	countIssuesByDistrict,
	listNoRecentVisitSchemes,
	countNoRecentVisitSchemes,
	listSpendWithoutProgressSchemes,
	countSpendWithoutProgressSchemes,
	listAtRiskSchemes,
	countAtRiskSchemes,
};
