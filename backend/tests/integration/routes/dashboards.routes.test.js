/**
 * Integration: GET /api/v1/dashboards/division against the real live
 * Supabase project, via supertest + real JWTs (tests/helpers/authToken.js).
 * Fixtures are raw inserts (same style as siteVisits.routes.test.js) covering
 * one team/visit/issue in the RD/DG test accounts' own division and one team
 * in a different division, to prove the rollups are actually division-scoped
 * and not just globally summed.
 *
 * Gated the same way as tests/integration/routes/siteVisits.routes.test.js —
 * see that file's header for why.
 */
'use strict';

const { envAvailable } = require('../../helpers/envAvailable');
const { dbAvailable } = require('../../helpers/pgTestClient');

// Step 33 fixture helpers — target_completion_date is stored as "Mon-YY"
// text (e.g. "Jun-27"), matching the real ADP CSV format surveyed directly
// against adp-database-seed-csv/schemes.csv (3711 of 3712 real rows). These
// build real labels/dates computed from the actual current date, not
// hardcoded, so the fixture stays valid no matter when this suite runs.
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthYearLabel(date) {
	return `${MONTH_ABBR[date.getUTCMonth()]}-${String(date.getUTCFullYear()).slice(-2)}`;
}
function endOfMonth(year, monthIndex0) {
	return new Date(Date.UTC(year, monthIndex0 + 1, 0)); // day 0 of next month = last day of this month
}
function addMonthsUtc(date, months) {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

const maybeDescribe = envAvailable() && dbAvailable() ? describe : describe.skip;

// Real network round trips (remote Supabase pooler + JWKS) — several seconds
// per first call, well past Jest's 5s default.
jest.setTimeout(30000);

maybeDescribe('GET /api/v1/dashboards/division', () => {
	let request;
	let app;
	let db;
	let getAccessToken;
	let f; // fixture ids

	beforeAll(async () => {
		request = require('supertest');
		app = require('../../../src/app');
		db = require('../../../src/config/database');
		({ getAccessToken } = require('../../helpers/authToken'));

		const users = {};
		for (const [key, email] of Object.entries({
			dg: 'dg.test@mec.local',
			rd: 'rd.test@mec.local',
			meo: 'meo.test@mec.local',
			support: 'support.test@mec.local',
		})) {
			const { rows } = await db.query('select id, division_id as "divisionId" from users where email = $1', [email]);
			if (!rows[0]) throw new Error(`Seeded test account missing: ${email} — run \`npm run seed:accounts\``);
			users[key] = rows[0].id;
		}
		const divisionA = (await db.query('select division_id as "divisionId" from users where id = $1', [users.dg])).rows[0].divisionId;

		const schemeA = (await db.query(
			`select s.id from schemes s
			 join scheme_districts sd on sd.scheme_id = s.id
			 join districts d on d.id = sd.district_id
			 where d.division_id = $1 limit 1`,
			[divisionA],
		)).rows[0]?.id;
		const schemeB = (await db.query(
			`select s.id from schemes s
			 join scheme_districts sd on sd.scheme_id = s.id
			 join districts d on d.id = sd.district_id
			 where d.division_id != $1 limit 1`,
			[divisionA],
		)).rows[0]?.id;
		if (!schemeA || !schemeB) throw new Error('Need a scheme inside and one outside division 1 — run `npm run seed:adp` first');

		// Step 23 analytics fixtures: 2 departments with >=2 schemes each inside
		// divisionA — one to actually report progress on (avgProgressPct should
		// be a real weighted number), one to leave entirely unreported
		// (avgProgressPct must come back null, never 0/NaN).
		const deptCandidates = (await db.query(
			`select dep.id as "departmentId", dep.name as "departmentName",
					array_agg(distinct s.id order by s.id) as "schemeIds"
			 from schemes s
			 join departments dep on dep.id = s.department_id
			 where exists (
				 select 1 from scheme_districts sd join districts d on d.id = sd.district_id
				 where sd.scheme_id = s.id and d.division_id = $1
			 )
			 group by dep.id, dep.name
			 having count(distinct s.id) >= 2
			 order by dep.id
			 limit 2`,
			[divisionA],
		)).rows;
		if (deptCandidates.length < 2) throw new Error('Need at least 2 departments with >=2 schemes each in division 1 — run `npm run seed:adp` first');
		const [deptProgress, deptNoProgress] = deptCandidates;

		// Self-heal: reset every scheme in both fixture departments to NULL
		// progress first (in case a prior crashed run left values behind), then
		// write only the exact values this test controls.
		await db.query('update schemes set physical_progress_pct = null, financial_progress_pct = null where id = any($1::bigint[])', [[...deptProgress.schemeIds, ...deptNoProgress.schemeIds]]);
		const [progressSchemeA, progressSchemeB] = deptProgress.schemeIds;
		await db.query('update schemes set physical_progress_pct = 80 where id = $1', [progressSchemeA]);
		await db.query('update schemes set physical_progress_pct = 20 where id = $1', [progressSchemeB]);
		// A distinctive value on the OTHER division's scheme — must never leak
		// into divisionA's progressByDepartment/overallProgress numbers below.
		await db.query('update schemes set physical_progress_pct = 99, financial_progress_pct = null where id = $1', [schemeB]);

		// Step 27 reconciliation fixtures: progressSchemeA's gap (95-80=15) stays
		// under the 25pp flag threshold; progressSchemeB's gap (90-20=70) clears
		// it — one flagged, one not, and 70 > 15 so ordering-by-worst-gap is
		// exercised too. schemeB gets a matching financial value (99) so its
		// gap is 0 — division B must still never leak into division A's list
		// regardless of how small or large its own gap is.
		await db.query('update schemes set financial_progress_pct = 95 where id = $1', [progressSchemeA]);
		await db.query('update schemes set financial_progress_pct = 90 where id = $1', [progressSchemeB]);
		await db.query('update schemes set financial_progress_pct = 99 where id = $1', [schemeB]);

		// Matches dashboard.repo's own EXISTS-based SCHEME_IN_DIVISION pattern
		// (not a join) — a scheme linked to multiple districts within the same
		// division must still only be counted once per department.
		const deptTotals = (await db.query(
			`select dep.id as "departmentId", count(s.id)::int as "schemesTotal"
			 from schemes s
			 join departments dep on dep.id = s.department_id
			 where dep.id in ($2, $3) and exists (
				 select 1 from scheme_districts sd join districts d on d.id = sd.district_id
				 where sd.scheme_id = s.id and d.division_id = $1
			 )
			 group by dep.id`,
			[divisionA, deptProgress.departmentId, deptNoProgress.departmentId],
		)).rows;
		const totalsByDeptId = Object.fromEntries(deptTotals.map((row) => [row.departmentId, row.schemesTotal]));

		// Self-heal from a crashed prior run, same rationale as rlsFixtures.js.
		await db.query(`delete from issue_reports where site_visit_id in (select id from site_visits where team_id in (select id from visit_teams where created_by = $1 and scheme_id in ($2,$3)))`, [users.rd, schemeA, schemeB]);
		await db.query(`delete from site_visits where team_id in (select id from visit_teams where created_by = $1 and scheme_id in ($2,$3))`, [users.rd, schemeA, schemeB]);
		await db.query(`delete from visit_team_members where team_id in (select id from visit_teams where created_by = $1 and scheme_id in ($2,$3))`, [users.rd, schemeA, schemeB]);
		await db.query('delete from visit_teams where created_by = $1 and scheme_id in ($2,$3)', [users.rd, schemeA, schemeB]);

		// Division A: one team per status, so byStatus counts are all exercised.
		const teamDraft = (await db.query(`insert into visit_teams (scheme_id, created_by, status) values ($1,$2,'DRAFT') returning id`, [schemeA, users.rd])).rows[0].id;
		const teamPending = (await db.query(`insert into visit_teams (scheme_id, created_by, status) values ($1,$2,'PENDING_APPROVAL') returning id`, [schemeA, users.rd])).rows[0].id;
		const teamApproved = (await db.query(`insert into visit_teams (scheme_id, created_by, status) values ($1,$2,'APPROVED') returning id`, [schemeA, users.rd])).rows[0].id;
		const teamRejected = (await db.query(`insert into visit_teams (scheme_id, created_by, status) values ($1,$2,'REJECTED') returning id`, [schemeA, users.rd])).rows[0].id;
		await db.query(`insert into visit_team_members (team_id, user_id, team_role) values ($1,$2,'LEAD_MEO')`, [teamApproved, users.meo]);

		const visitScheduled = (await db.query(`insert into site_visits (team_id, scheme_id, status) values ($1,$2,'SCHEDULED') returning id`, [teamApproved, schemeA])).rows[0].id;

		const issueOpen = (await db.query(
			`insert into issue_reports (site_visit_id, reported_by, issue_type, severity, description) values ($1,$2,'Erosion','HIGH','Retaining wall eroded') returning id`,
			[visitScheduled, users.meo],
		)).rows[0].id;
		const issueResolved = (await db.query(
			`insert into issue_reports (site_visit_id, reported_by, issue_type, severity, description, status) values ($1,$2,'Fence','LOW','Fence damaged','RESOLVED') returning id`,
			[visitScheduled, users.meo],
		)).rows[0].id;

		// Division B: a team + visit that must never show up in division A's rollup.
		const teamB = (await db.query(`insert into visit_teams (scheme_id, created_by, status) values ($1,$2,'APPROVED') returning id`, [schemeB, users.rd])).rows[0].id;
		const visitB = (await db.query(`insert into site_visits (team_id, scheme_id, status) values ($1,$2,'SCHEDULED') returning id`, [teamB, schemeB])).rows[0].id;

		// Step 31 anomaly-detection fixtures.
		// "no visit in X months": a scheme whose only completed visit is well
		// past the 6-month threshold (reuses schemeA — it's already a division-A
		// fixture scheme with no completed visit of its own yet, only the
		// SCHEDULED one above), and one of deptNoProgress's schemes given a
		// COMPLETED visit completed just now, which must NOT be flagged.
		const [visitedRecentlyScheme] = deptNoProgress.schemeIds;
		await db.query(`delete from site_visits where team_id in (select id from visit_teams where created_by = $1 and scheme_id in ($2,$3)) and status = 'COMPLETED'`, [users.rd, schemeA, visitedRecentlyScheme]);

		const teamOverdue = (await db.query(`insert into visit_teams (scheme_id, created_by, status) values ($1,$2,'APPROVED') returning id`, [schemeA, users.rd])).rows[0].id;
		const visitOverdue = (await db.query(
			`insert into site_visits (team_id, scheme_id, status, completed_at) values ($1,$2,'COMPLETED', now() - interval '10 months') returning id`,
			[teamOverdue, schemeA],
		)).rows[0].id;

		const teamRecent = (await db.query(`insert into visit_teams (scheme_id, created_by, status) values ($1,$2,'APPROVED') returning id`, [visitedRecentlyScheme, users.rd])).rows[0].id;
		const visitRecent = (await db.query(
			`insert into site_visits (team_id, scheme_id, status, completed_at) values ($1,$2,'COMPLETED', now()) returning id`,
			[teamRecent, visitedRecentlyScheme],
		)).rows[0].id;

		// "spend-without-progress": a dedicated scheme outside deptProgress/
		// deptNoProgress (so setting its progress values can't skew those
		// departments' own exact schemesReported/avgProgressPct assertions
		// above) with financial far ahead of physical.
		const schemeSpend = (await db.query(
			`select s.id from schemes s
			 join scheme_districts sd on sd.scheme_id = s.id
			 join districts d on d.id = sd.district_id
			 where d.division_id = $1 and s.department_id not in ($2,$3)
			 limit 1`,
			[divisionA, deptProgress.departmentId, deptNoProgress.departmentId],
		)).rows[0]?.id;
		if (!schemeSpend) throw new Error('Need a division-1 scheme outside the two fixture departments — run `npm run seed:adp` first');
		await db.query('update schemes set physical_progress_pct = 5, financial_progress_pct = 70 where id = $1', [schemeSpend]);

		// Step 33 predictive-risk-flagging fixtures: 3 more dedicated schemes
		// (same "outside the two fixture departments, so progressByDepartment's
		// exact-count assertions stay untouched" reasoning as schemeSpend above),
		// excluding schemeSpend itself.
		const riskSchemeRows = (await db.query(
			`select s.id from schemes s
			 join scheme_districts sd on sd.scheme_id = s.id
			 join districts d on d.id = sd.district_id
			 where d.division_id = $1 and s.department_id not in ($2,$3) and s.id != $4
			 order by s.id limit 3`,
			[divisionA, deptProgress.departmentId, deptNoProgress.departmentId, schemeSpend],
		)).rows;
		if (riskSchemeRows.length < 3) throw new Error('Need 3 more division-1 schemes outside the two fixture departments — run `npm run seed:adp` first');
		const [schemeOverdue, schemeBehindPace, schemeOnPace] = riskSchemeRows.map((r) => r.id);

		// Unlike physical_progress_pct (always NULL until the app itself writes
		// it, Step 23), date_of_approval/target_completion_date are REAL data
		// from the ADP booklet import (schema.md §4.1) — overwriting them for
		// this fixture must restore the originals afterward, never null them
		// out, or this suite would permanently destroy real imported reference
		// data for these 3 schemes.
		const originalRiskSchemeValues = (await db.query(
			`select id, date_of_approval as "dateOfApproval", target_completion_date as "targetCompletionDate"
			 from schemes where id = any($1::bigint[])`,
			[[schemeOverdue, schemeBehindPace, schemeOnPace]],
		)).rows;

		const now = new Date();
		// Overdue: target 3 months in the past (safely past, independent of
		// which day of the current month "now" is), approved 1 year before that
		// — isOverdue must flag it regardless of the gap/threshold math.
		const overdueTargetDate = endOfMonth(addMonthsUtc(now, -3).getUTCFullYear(), addMonthsUtc(now, -3).getUTCMonth());
		const overdueApprovalDate = new Date(overdueTargetDate.getTime() - 365 * 86400000);

		// Not yet overdue, ~400-day total span, computed from the real target
		// month's actual end-of-month date so the expected-progress math below
		// matches what the backend's own SQL will independently derive.
		const paceTargetMonth = addMonthsUtc(now, 6);
		const paceTargetDate = endOfMonth(paceTargetMonth.getUTCFullYear(), paceTargetMonth.getUTCMonth());
		const paceApprovalDate = new Date(paceTargetDate.getTime() - 400 * 86400000);
		const elapsedDays = Math.round((now.getTime() - paceApprovalDate.getTime()) / 86400000);
		const expectedPct = Math.max(0, Math.min(100, (elapsedDays / 400) * 100));
		// Comfortably clear of the 20pp threshold either direction, with margin
		// for the small (sub-1-day) JS-vs-Postgres clock difference.
		const behindPacePhysicalPct = Math.max(0, Math.round(expectedPct) - 40);
		const onPacePhysicalPct = Math.min(99, Math.max(0, Math.round(expectedPct) - 5));

		await db.query(
			`update schemes set date_of_approval = $2, target_completion_date = $3, physical_progress_pct = $4 where id = $1`,
			[schemeOverdue, overdueApprovalDate.toISOString().slice(0, 10), monthYearLabel(overdueTargetDate), 50],
		);
		await db.query(
			`update schemes set date_of_approval = $2, target_completion_date = $3, physical_progress_pct = $4 where id = $1`,
			[schemeBehindPace, paceApprovalDate.toISOString().slice(0, 10), monthYearLabel(paceTargetDate), behindPacePhysicalPct],
		);
		await db.query(
			`update schemes set date_of_approval = $2, target_completion_date = $3, physical_progress_pct = $4 where id = $1`,
			[schemeOnPace, paceApprovalDate.toISOString().slice(0, 10), monthYearLabel(paceTargetDate), onPacePhysicalPct],
		);

		f = {
			...users, divisionA, schemeA, schemeB, teamDraft, teamPending, teamApproved, teamRejected, teamB,
			visitScheduled, visitB, issueOpen, issueResolved,
			deptProgress: { ...deptProgress, schemesTotal: totalsByDeptId[deptProgress.departmentId] },
			deptNoProgress: { ...deptNoProgress, schemesTotal: totalsByDeptId[deptNoProgress.departmentId] },
			progressSchemeA, progressSchemeB,
			teamOverdue, visitOverdue, teamRecent, visitRecent, visitedRecentlyScheme, schemeSpend,
			schemeOverdue, schemeBehindPace, schemeOnPace,
			expectedPctAtPaceTargets: expectedPct,
			originalRiskSchemeValues,
		};
	}, 45000); // several sequential round trips to the remote Supabase pooler + JWKS fetch on first login — bumped from 30000 once the Step 27 reconciliation fixture writes pushed it over that budget

	afterAll(async () => {
		if (!db) return; // beforeAll failed before db was even assigned — nothing to clean up
		if (f) {
			await db.query('delete from issue_reports where id in ($1,$2)', [f.issueOpen, f.issueResolved]);
			await db.query('delete from site_visits where id in ($1,$2,$3,$4)', [f.visitScheduled, f.visitB, f.visitOverdue, f.visitRecent]);
			await db.query('delete from visit_team_members where team_id = $1', [f.teamApproved]);
			await db.query('delete from visit_teams where id in ($1,$2,$3,$4,$5,$6,$7)', [f.teamDraft, f.teamPending, f.teamApproved, f.teamRejected, f.teamB, f.teamOverdue, f.teamRecent]);
			// Step 23/27 analytics + reconciliation fixtures — reset the progress values this suite wrote.
			await db.query('update schemes set physical_progress_pct = null, financial_progress_pct = null where id = any($1::bigint[])', [[...f.deptProgress.schemeIds, ...f.deptNoProgress.schemeIds, f.schemeB, f.schemeSpend]]);
			// Step 33 risk-flagging fixtures — physical_progress_pct resets to its
			// normal unreported-default NULL, but date_of_approval/
			// target_completion_date are real ADP-imported data (schema.md §4.1,
			// not app-owned the way physical_progress_pct is) and must be
			// restored to their real original values, never nulled out.
			await db.query('update schemes set physical_progress_pct = null where id = any($1::bigint[])', [[f.schemeOverdue, f.schemeBehindPace, f.schemeOnPace]]);
			for (const original of f.originalRiskSchemeValues) {
				await db.query('update schemes set date_of_approval = $2, target_completion_date = $3 where id = $1', [original.id, original.dateOfApproval, original.targetCompletionDate]);
			}
		}
		await db.close();
	});

	test('rejects an unauthenticated request', async () => {
		const res = await request(app).get('/api/v1/dashboards/division');
		expect(res.status).toBe(401);
	});

	test('MEO and SUPPORT_USER are forbidden — this dashboard is RD/DG only', async () => {
		const meoToken = await getAccessToken('MEO');
		const meoRes = await request(app).get('/api/v1/dashboards/division').set('Authorization', `Bearer ${meoToken}`);
		expect(meoRes.status).toBe(403);

		const supportToken = await getAccessToken('SUPPORT_USER');
		const supportRes = await request(app).get('/api/v1/dashboards/division').set('Authorization', `Bearer ${supportToken}`);
		expect(supportRes.status).toBe(403);
	});

	test('RD sees division-A team/visit/issue counts, excluding division B entirely', async () => {
		const token = await getAccessToken('REGIONAL_DIRECTOR');
		const res = await request(app).get('/api/v1/dashboards/division').set('Authorization', `Bearer ${token}`);

		expect(res.status).toBe(200);
		const { data } = res.body;
		expect(data.division.id).toBe(f.divisionA);

		expect(data.teams.byStatus.DRAFT).toBeGreaterThanOrEqual(1);
		expect(data.teams.byStatus.PENDING_APPROVAL).toBeGreaterThanOrEqual(1);
		expect(data.teams.byStatus.APPROVED).toBeGreaterThanOrEqual(1);
		expect(data.teams.byStatus.REJECTED).toBeGreaterThanOrEqual(1);
		expect(data.teams.total).toBe(
			data.teams.byStatus.DRAFT + data.teams.byStatus.PENDING_APPROVAL + data.teams.byStatus.APPROVED + data.teams.byStatus.REJECTED,
		);

		expect(data.visits.byStatus.SCHEDULED).toBeGreaterThanOrEqual(1);

		expect(data.issues.byStatus.OPEN).toBeGreaterThanOrEqual(1);
		expect(data.issues.byStatus.RESOLVED).toBeGreaterThanOrEqual(1);
		expect(data.issues.bySeverity.HIGH).toBeGreaterThanOrEqual(1);
		expect(data.issues.open).toBeGreaterThanOrEqual(1);
		expect(data.issues.open).toBeLessThan(data.issues.total);

		expect(data.recentVisits.map((v) => v.id)).toContain(f.visitScheduled);
		expect(data.recentVisits.map((v) => v.id)).not.toContain(f.visitB);

		expect(data.recentIssues.map((i) => i.id)).toContain(f.issueOpen);
		expect(data.recentIssues.map((i) => i.id)).not.toContain(f.issueResolved);
	});

	test('DG (same division) sees the identical division-scoped rollup', async () => {
		const token = await getAccessToken('DIRECTOR_GENERAL');
		const res = await request(app).get('/api/v1/dashboards/division').set('Authorization', `Bearer ${token}`);

		expect(res.status).toBe(200);
		expect(res.body.data.division.id).toBe(f.divisionA);
		expect(res.body.data.teams.total).toBeGreaterThanOrEqual(4);
		expect(res.body.data.recentVisits.map((v) => v.id)).not.toContain(f.visitB);
	});

	test('progressByDepartment/overallProgress (Step 23): correct numbers, null for an unreported department, cross-division isolation', async () => {
		const token = await getAccessToken('REGIONAL_DIRECTOR');
		const res = await request(app).get('/api/v1/dashboards/division').set('Authorization', `Bearer ${token}`);

		expect(res.status).toBe(200);
		const { data } = res.body;

		const progressRow = data.progressByDepartment.find((row) => row.departmentId === f.deptProgress.departmentId);
		expect(progressRow).toBeDefined();
		expect(progressRow.departmentName).toBe(f.deptProgress.departmentName);
		expect(progressRow.schemesTotal).toBe(f.deptProgress.schemesTotal);
		// Only the 2 schemes this suite set (80, 20) are reported — schemeB's 99
		// lives in a different division and must not be counted or averaged in.
		expect(progressRow.schemesReported).toBe(2);
		expect(progressRow.avgProgressPct).toBeCloseTo(50, 6);

		const noProgressRow = data.progressByDepartment.find((row) => row.departmentId === f.deptNoProgress.departmentId);
		expect(noProgressRow).toBeDefined();
		expect(noProgressRow.schemesTotal).toBe(f.deptNoProgress.schemesTotal);
		expect(noProgressRow.schemesReported).toBe(0);
		expect(noProgressRow.avgProgressPct).toBeNull();

		// overallProgress: recompute the expected weighted average from the
		// division's own full progressByDepartment response (proves the
		// service weights by schemesReported rather than naively averaging
		// per-department averages) and cross-check against the endpoint's value.
		const expected = data.progressByDepartment.reduce(
			(acc, row) => {
				acc.schemesTotal += row.schemesTotal;
				acc.schemesReported += row.schemesReported;
				if (row.avgProgressPct != null) acc.weightedSum += row.avgProgressPct * row.schemesReported;
				return acc;
			},
			{ schemesTotal: 0, schemesReported: 0, weightedSum: 0 },
		);
		expect(data.overallProgress.schemesTotal).toBe(expected.schemesTotal);
		expect(data.overallProgress.schemesReported).toBe(expected.schemesReported);
		expect(data.overallProgress.avgProgressPct).toBeCloseTo(expected.weightedSum / expected.schemesReported, 6);
		// This division's own reported schemes must contribute — proves the
		// figure isn't accidentally always null/0.
		expect(data.overallProgress.schemesReported).toBeGreaterThanOrEqual(2);
	});

	test('a different division\'s scheme progress never leaks into progressByDepartment/overallProgress', async () => {
		const token = await getAccessToken('REGIONAL_DIRECTOR');
		const res = await request(app).get('/api/v1/dashboards/division').set('Authorization', `Bearer ${token}`);

		expect(res.status).toBe(200);
		const { data } = res.body;
		// schemeB (division B) was set to 99 — if it ever leaked into divisionA's
		// rollup it would either inflate a department's avgProgressPct toward 99
		// or add an extra schemesReported count neither fixture value explains.
		const progressRow = data.progressByDepartment.find((row) => row.departmentId === f.deptProgress.departmentId);
		expect(progressRow.schemesReported).toBe(2);
		expect(progressRow.avgProgressPct).toBeCloseTo(50, 6);
	});

	describe('GET /api/v1/dashboards/reconciliation (Step 27 — physical vs. financial progress)', () => {
		test('rejects an unauthenticated request and forbids MEO/Support', async () => {
			const unauth = await request(app).get('/api/v1/dashboards/reconciliation');
			expect(unauth.status).toBe(401);

			const meoToken = await getAccessToken('MEO');
			const meoRes = await request(app).get('/api/v1/dashboards/reconciliation').set('Authorization', `Bearer ${meoToken}`);
			expect(meoRes.status).toBe(403);

			const supportToken = await getAccessToken('SUPPORT_USER');
			const supportRes = await request(app).get('/api/v1/dashboards/reconciliation').set('Authorization', `Bearer ${supportToken}`);
			expect(supportRes.status).toBe(403);
		});

		test('RD sees both fixture schemes with correct gaps, worst-divergence first, division B excluded entirely', async () => {
			const token = await getAccessToken('REGIONAL_DIRECTOR');
			const res = await request(app).get('/api/v1/dashboards/reconciliation').query({ limit: 50 }).set('Authorization', `Bearer ${token}`);

			expect(res.status).toBe(200);
			const { rows } = res.body.data;

			const rowA = rows.find((r) => r.id === f.progressSchemeA);
			const rowB = rows.find((r) => r.id === f.progressSchemeB);
			expect(rowA).toBeDefined();
			expect(rowB).toBeDefined();
			expect(rowA.physicalProgressPct).toBe(80);
			expect(rowA.financialProgressPct).toBe(95);
			expect(rowA.gap).toBeCloseTo(15, 6);
			expect(rowB.physicalProgressPct).toBe(20);
			expect(rowB.financialProgressPct).toBe(90);
			expect(rowB.gap).toBeCloseTo(70, 6);

			// progressSchemeB's gap (70) is bigger than progressSchemeA's (15) —
			// worst divergence must sort first.
			expect(rows.findIndex((r) => r.id === f.progressSchemeB)).toBeLessThan(rows.findIndex((r) => r.id === f.progressSchemeA));

			// Division B's scheme must never appear, regardless of its own gap.
			expect(rows.some((r) => r.id === f.schemeB)).toBe(false);
		});

		test('DG (same division) sees the identical rows', async () => {
			const token = await getAccessToken('DIRECTOR_GENERAL');
			const res = await request(app).get('/api/v1/dashboards/reconciliation').query({ limit: 50 }).set('Authorization', `Bearer ${token}`);

			expect(res.status).toBe(200);
			expect(res.body.data.rows.some((r) => r.id === f.progressSchemeA)).toBe(true);
			expect(res.body.data.rows.some((r) => r.id === f.progressSchemeB)).toBe(true);
		});

		test('flaggedOnly=true keeps the 70pp-gap scheme and drops the 15pp-gap one (threshold is 25)', async () => {
			const token = await getAccessToken('REGIONAL_DIRECTOR');
			const res = await request(app)
				.get('/api/v1/dashboards/reconciliation')
				.query({ flaggedOnly: 'true', limit: 50 })
				.set('Authorization', `Bearer ${token}`);

			expect(res.status).toBe(200);
			expect(res.body.data.flagThresholdPct).toBe(25);
			expect(res.body.data.rows.some((r) => r.id === f.progressSchemeB)).toBe(true);
			expect(res.body.data.rows.some((r) => r.id === f.progressSchemeA)).toBe(false);
			expect(res.body.data.schemesFlagged).toBeGreaterThanOrEqual(1);
			expect(res.body.data.schemesWithBothValues).toBeGreaterThanOrEqual(2);
		});

		test('cursor pagination with limit=1 returns one row at a time, still worst-gap-first, with a working nextCursor', async () => {
			const token = await getAccessToken('REGIONAL_DIRECTOR');
			const first = await request(app).get('/api/v1/dashboards/reconciliation').query({ limit: 1 }).set('Authorization', `Bearer ${token}`);
			expect(first.status).toBe(200);
			expect(first.body.data.rows).toHaveLength(1);
			expect(first.body.meta.nextCursor).toBeTruthy();

			const second = await request(app)
				.get('/api/v1/dashboards/reconciliation')
				.query({ limit: 1, cursor: first.body.meta.nextCursor })
				.set('Authorization', `Bearer ${token}`);
			expect(second.status).toBe(200);
			expect(second.body.data.rows).toHaveLength(1);
			// The two pages must never repeat the same scheme.
			expect(second.body.data.rows[0].id).not.toBe(first.body.data.rows[0].id);
		});

		test('a malformed cursor is rejected with 400', async () => {
			const token = await getAccessToken('REGIONAL_DIRECTOR');
			const res = await request(app)
				.get('/api/v1/dashboards/reconciliation')
				.query({ cursor: 'not-a-cursor' })
				.set('Authorization', `Bearer ${token}`);
			expect(res.status).toBe(400);
		});
	});

	describe('GET /api/v1/dashboards/anomalies (Step 31 — delay/anomaly detection)', () => {
		test('rejects an unauthenticated request and forbids MEO/Support', async () => {
			const unauth = await request(app).get('/api/v1/dashboards/anomalies');
			expect(unauth.status).toBe(401);

			const meoToken = await getAccessToken('MEO');
			const meoRes = await request(app).get('/api/v1/dashboards/anomalies').set('Authorization', `Bearer ${meoToken}`);
			expect(meoRes.status).toBe(403);

			const supportToken = await getAccessToken('SUPPORT_USER');
			const supportRes = await request(app).get('/api/v1/dashboards/anomalies').set('Authorization', `Bearer ${supportToken}`);
			expect(supportRes.status).toBe(403);
		});

		test('a limit over the 200 cap is rejected with 400', async () => {
			const token = await getAccessToken('REGIONAL_DIRECTOR');
			const res = await request(app).get('/api/v1/dashboards/anomalies').query({ limit: 500 }).set('Authorization', `Bearer ${token}`);
			expect(res.status).toBe(400);
		});

		test('RD sees the real fixed thresholds (6 months, 50%/10%)', async () => {
			const token = await getAccessToken('REGIONAL_DIRECTOR');
			const res = await request(app).get('/api/v1/dashboards/anomalies').set('Authorization', `Bearer ${token}`);

			expect(res.status).toBe(200);
			expect(res.body.data.noVisitThresholdMonths).toBe(6);
			expect(res.body.data.spendWithoutProgressThresholds).toEqual({ financialMinPct: 50, physicalMaxPct: 10 });
		});

		/**
		 * The real live project's division-1 already has far more
		 * never-visited schemes than any reasonable HTTP `limit` cap (200) —
		 * phases.md's own "can't be built or validated on day-one data"
		 * warning, confirmed in practice: a `limit: 200` HTTP request still
		 * doesn't surface this suite's own fixture scheme behind hundreds of
		 * real never-visited ones. These two tests call `dashboard.repo`'s
		 * `listNoRecentVisitSchemes`/`countNoRecentVisitSchemes` directly
		 * instead of through the capped HTTP endpoint — same live database,
		 * same production SQL, just without the deliberately-small cap the
		 * HTTP layer applies for response-size sanity. The HTTP-level cap
		 * itself is covered separately by the "limit over 200" test above.
		 */
		test('"no visit in X months": the fixture\'s 10-month-overdue scheme is flagged with the correct lastVisitDate, via dashboard.repo directly (bypassing the HTTP response cap)', async () => {
			const dashboardRepo = require('../../../src/repositories/dashboard.repo');
			const rows = await dashboardRepo.listNoRecentVisitSchemes(f.divisionA, 6, 5000);

			const overdueRow = rows.find((r) => r.id === f.schemeA);
			expect(overdueRow).toBeDefined();
			expect(overdueRow.lastVisitDate).toBeTruthy();
			expect(new Date(overdueRow.lastVisitDate).getTime()).toBeLessThan(Date.now() - 1000 * 60 * 60 * 24 * 150); // comfortably over 5 months ago

			expect(rows.some((r) => r.id === f.visitedRecentlyScheme)).toBe(false);

			const neverVisitedRow = rows.find((r) => r.lastVisitDate === null);
			expect(neverVisitedRow).toBeDefined();
			// Never-visited (null) sorts first.
			expect(rows.findIndex((r) => r.lastVisitDate === null)).toBeLessThanOrEqual(rows.findIndex((r) => r.id === f.schemeA));
		});

		test('giving a previously-unflagged scheme a COMPLETED visit decreases the flagged count by exactly 1 (count-delta, immune to list-size crowding)', async () => {
			const dashboardRepo = require('../../../src/repositories/dashboard.repo');
			const countWithRecentVisit = await dashboardRepo.countNoRecentVisitSchemes(f.divisionA, 6);

			await db.query('delete from site_visits where id = $1', [f.visitRecent]);
			try {
				const countWithoutRecentVisit = await dashboardRepo.countNoRecentVisitSchemes(f.divisionA, 6);
				expect(countWithoutRecentVisit).toBe(countWithRecentVisit + 1);
			} finally {
				// Reinsert so afterAll's cleanup-by-id still has a real row to delete.
				const reinserted = await db.query(
					`insert into site_visits (id, team_id, scheme_id, status, completed_at) values ($1,$2,$3,'COMPLETED', now()) returning id`,
					[f.visitRecent, f.teamRecent, f.visitedRecentlyScheme],
				);
				expect(reinserted.rows[0].id).toBe(f.visitRecent);
			}
		});

		test('division B never leaks into the no-recent-visit list', async () => {
			const token = await getAccessToken('REGIONAL_DIRECTOR');
			const res = await request(app).get('/api/v1/dashboards/anomalies').set('Authorization', `Bearer ${token}`);

			expect(res.status).toBe(200);
			expect(res.body.data.noRecentVisit.rows.some((r) => r.id === f.schemeB)).toBe(false);
		});

		test('"spend-without-progress": flags the fixture scheme (5% physical, 70% financial), excludes schemes under the physical-max or financial-min bar', async () => {
			const token = await getAccessToken('REGIONAL_DIRECTOR');
			const res = await request(app).get('/api/v1/dashboards/anomalies').query({ limit: 200 }).set('Authorization', `Bearer ${token}`);

			expect(res.status).toBe(200);
			const { rows } = res.body.data.spendWithoutProgress;
			const flagged = rows.find((r) => r.id === f.schemeSpend);
			expect(flagged).toBeDefined();
			expect(flagged.physicalProgressPct).toBe(5);
			expect(flagged.financialProgressPct).toBe(70);

			// progressSchemeB (20% physical, 90% financial) clears the financial
			// bar but NOT the physical<=10 bar — must be excluded, proving this
			// is a stricter, narrower check than Step 27's generic gap.
			expect(rows.some((r) => r.id === f.progressSchemeB)).toBe(false);
			// progressSchemeA (80% physical, 95% financial) clears neither bar.
			expect(rows.some((r) => r.id === f.progressSchemeA)).toBe(false);
			// Division B's scheme (financial 99, physical 99) must never appear.
			expect(rows.some((r) => r.id === f.schemeB)).toBe(false);
		});

		test('DG (same division) sees the identical anomaly rows for the signal that isn\'t crowded by real data (spend-without-progress) and the same thresholds', async () => {
			const token = await getAccessToken('DIRECTOR_GENERAL');
			const res = await request(app).get('/api/v1/dashboards/anomalies').set('Authorization', `Bearer ${token}`);

			expect(res.status).toBe(200);
			expect(res.body.data.noVisitThresholdMonths).toBe(6);
			expect(res.body.data.riskGapThresholdPct).toBe(20);
			expect(res.body.data.spendWithoutProgress.rows.some((r) => r.id === f.schemeSpend)).toBe(true);
		});

		/**
		 * Step 33 — predictive risk flagging, "builds directly on the
		 * anomaly-detection foundation." Three dedicated fixture schemes
		 * (date_of_approval/target_completion_date/physical_progress_pct all
		 * set directly, since this project writes none of the first two through
		 * any API and only writes the third via a real submitted visit form):
		 * one already past its target date and incomplete (must flag regardless
		 * of the pace gap), one on the same ~400-day pace timeline but 40
		 * points behind the linear-pace projection (must flag — over the 20pp
		 * threshold), and one only 5 points behind on the identical timeline
		 * (must NOT flag — comfortably under the threshold).
		 */
		test('an already-overdue, incomplete scheme is flagged regardless of its progress gap', async () => {
			const token = await getAccessToken('REGIONAL_DIRECTOR');
			const res = await request(app).get('/api/v1/dashboards/anomalies').query({ limit: 200 }).set('Authorization', `Bearer ${token}`);

			expect(res.status).toBe(200);
			const row = res.body.data.atRiskOfMissingTarget.rows.find((r) => r.id === f.schemeOverdue);
			expect(row).toBeDefined();
			expect(row.isOverdue).toBe(true);
			expect(row.physicalProgressPct).toBe(50);
			expect(new Date(row.targetDate).getTime()).toBeLessThan(Date.now());
		});

		test('a scheme 40 points behind the linear-pace projection is flagged, sorting before a 5-points-behind one that is not flagged at all', async () => {
			const token = await getAccessToken('REGIONAL_DIRECTOR');
			const res = await request(app).get('/api/v1/dashboards/anomalies').query({ limit: 200 }).set('Authorization', `Bearer ${token}`);

			expect(res.status).toBe(200);
			const { rows } = res.body.data.atRiskOfMissingTarget;

			const behindPaceRow = rows.find((r) => r.id === f.schemeBehindPace);
			expect(behindPaceRow).toBeDefined();
			expect(behindPaceRow.isOverdue).toBe(false);
			expect(behindPaceRow.expectedProgressPct).toBeCloseTo(f.expectedPctAtPaceTargets, 0);
			expect(behindPaceRow.expectedProgressPct - behindPaceRow.physicalProgressPct).toBeGreaterThanOrEqual(20);

			expect(rows.some((r) => r.id === f.schemeOnPace)).toBe(false);

			// An overdue scheme (schemeOverdue, if present in this same capped
			// page) must sort before a not-yet-overdue one, matching
			// dashboard.repo's own "isOverdue desc, gap desc" ordering.
			const overdueIndex = rows.findIndex((r) => r.id === f.schemeOverdue);
			const behindPaceIndex = rows.findIndex((r) => r.id === f.schemeBehindPace);
			if (overdueIndex !== -1) expect(overdueIndex).toBeLessThan(behindPaceIndex);
		});

		test('division B never leaks into the at-risk list', async () => {
			const token = await getAccessToken('REGIONAL_DIRECTOR');
			const res = await request(app).get('/api/v1/dashboards/anomalies').query({ limit: 200 }).set('Authorization', `Bearer ${token}`);

			expect(res.status).toBe(200);
			expect(res.body.data.atRiskOfMissingTarget.rows.some((r) => r.id === f.schemeB)).toBe(false);
		});

		test('DG (same division) sees the identical at-risk rows', async () => {
			const token = await getAccessToken('DIRECTOR_GENERAL');
			const res = await request(app).get('/api/v1/dashboards/anomalies').query({ limit: 200 }).set('Authorization', `Bearer ${token}`);

			expect(res.status).toBe(200);
			expect(res.body.data.atRiskOfMissingTarget.rows.some((r) => r.id === f.schemeOverdue)).toBe(true);
			expect(res.body.data.atRiskOfMissingTarget.rows.some((r) => r.id === f.schemeBehindPace)).toBe(true);
			expect(res.body.data.atRiskOfMissingTarget.rows.some((r) => r.id === f.schemeOnPace)).toBe(false);
		});
	});

	/**
	 * Step 32 — automated digest reports. The digest check runs via
	 * runInBackground (real, not mocked here) *after* GET /dashboards/division
	 * sends its response, so it isn't written by the time supertest's
	 * request() resolves — these tests poll briefly, the same tolerance
	 * tests/integration/routes/notificationTriggers.routes.test.js's own
	 * waitForNotifications already needs for a real background dispatch.
	 * Scoped entirely to the RD test account's own last_*_digest_at columns
	 * (set directly before each test, reset after) so these tests control
	 * their own "is a digest due" state rather than depending on whatever
	 * the account's real history happens to be.
	 */
	describe('digest notification trigger (Step 32 — automated weekly/monthly digest)', () => {
		const DAY_MS = 24 * 60 * 60 * 1000;
		const DIGEST_TITLES = ['Weekly division digest', 'Monthly division digest'];

		async function waitForDigest(title, { timeout = 5000, interval = 150 } = {}) {
			const deadline = Date.now() + timeout;
			for (;;) {
				const { rows } = await db.query(
					`select id, title, body, related_type as "relatedType", related_id as "relatedId", created_at as "createdAt"
					 from notifications where user_id = $1 and title = $2 order by created_at desc`,
					[f.rd, title],
				);
				if (rows.length) return rows;
				if (Date.now() >= deadline) return rows;
				await new Promise((resolve) => setTimeout(resolve, interval));
			}
		}

		afterEach(async () => {
			await db.query(`delete from notifications where user_id = $1 and title = any($2::text[])`, [f.rd, DIGEST_TITLES]);
		});

		afterAll(async () => {
			// Leave the real test account in a sane, fully-"caught-up" state
			// for any other suite/session that runs after this one.
			await db.query('update users set last_weekly_digest_at = now(), last_monthly_digest_at = now() where id = $1', [f.rd]);
		});

		test('a never-set baseline (both columns null) records "sent" for both periods without sending any notification', async () => {
			await db.query('update users set last_weekly_digest_at = null, last_monthly_digest_at = null where id = $1', [f.rd]);

			const token = await getAccessToken('REGIONAL_DIRECTOR');
			const res = await request(app).get('/api/v1/dashboards/division').set('Authorization', `Bearer ${token}`);
			expect(res.status).toBe(200);

			let updated;
			const deadline = Date.now() + 5000;
			for (;;) {
				updated = (await db.query('select last_weekly_digest_at as "lastWeeklyDigestAt", last_monthly_digest_at as "lastMonthlyDigestAt" from users where id = $1', [f.rd])).rows[0];
				if (updated.lastWeeklyDigestAt && updated.lastMonthlyDigestAt) break;
				if (Date.now() >= deadline) break;
				await new Promise((resolve) => setTimeout(resolve, 150));
			}
			expect(updated.lastWeeklyDigestAt).toBeTruthy();
			expect(updated.lastMonthlyDigestAt).toBeTruthy();

			const notifs = (await db.query(`select id from notifications where user_id = $1 and title = any($2::text[])`, [f.rd, DIGEST_TITLES])).rows;
			expect(notifs).toHaveLength(0);
		});

		test('a weekly digest overdue by more than 7 days sends a real notification carrying the division\'s real numbers', async () => {
			await db.query(
				'update users set last_weekly_digest_at = $2, last_monthly_digest_at = now() where id = $1',
				[f.rd, new Date(Date.now() - 8 * DAY_MS).toISOString()],
			);

			const token = await getAccessToken('REGIONAL_DIRECTOR');
			const res = await request(app).get('/api/v1/dashboards/division').set('Authorization', `Bearer ${token}`);
			expect(res.status).toBe(200);

			const rows = await waitForDigest('Weekly division digest');
			expect(rows).toHaveLength(1);
			expect(rows[0].relatedType).toBe('DIVISION_DIGEST');
			expect(rows[0].relatedId).toBe(String(f.divisionA));
			expect(rows[0].body).toMatch(/\d+ teams/);
			expect(rows[0].body).toMatch(/\d+ visits/);
			expect(rows[0].body).toMatch(/\d+ open issues/);
			// Mirrors the exact byStatus/overallProgress numbers the same
			// response body already returned, proving the digest text isn't
			// just plausible-looking but actually built from this response.
			expect(rows[0].body).toContain(`${res.body.data.teams.total} teams`);
			expect(rows[0].body).toContain(`${res.body.data.visits.total} visits`);
		});

		test('a monthly digest overdue by more than 30 days sends independently of the weekly one', async () => {
			await db.query(
				'update users set last_weekly_digest_at = now(), last_monthly_digest_at = $2 where id = $1',
				[f.rd, new Date(Date.now() - 31 * DAY_MS).toISOString()],
			);

			const token = await getAccessToken('REGIONAL_DIRECTOR');
			const res = await request(app).get('/api/v1/dashboards/division').set('Authorization', `Bearer ${token}`);
			expect(res.status).toBe(200);

			const monthlyRows = await waitForDigest('Monthly division digest');
			expect(monthlyRows).toHaveLength(1);

			// Weekly was just "sent" (now()) moments ago by the update above —
			// must not also fire in this same check.
			const weeklyRows = (await db.query(`select id from notifications where user_id = $1 and title = $2`, [f.rd, 'Weekly division digest'])).rows;
			expect(weeklyRows).toHaveLength(0);
		});

		test('neither digest fires when both were sent less than a week/month ago', async () => {
			await db.query('update users set last_weekly_digest_at = now(), last_monthly_digest_at = now() where id = $1', [f.rd]);

			const token = await getAccessToken('REGIONAL_DIRECTOR');
			const res = await request(app).get('/api/v1/dashboards/division').set('Authorization', `Bearer ${token}`);
			expect(res.status).toBe(200);

			// No deadline to wait out an absence — a short grace period lets a
			// wrongly-firing background dispatch land before asserting it didn't.
			await new Promise((resolve) => setTimeout(resolve, 600));
			const notifs = (await db.query(`select id from notifications where user_id = $1 and title = any($2::text[])`, [f.rd, DIGEST_TITLES])).rows;
			expect(notifs).toHaveLength(0);
		});
	});
});
