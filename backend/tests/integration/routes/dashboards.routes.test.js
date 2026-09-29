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

		f = {
			...users, divisionA, schemeA, schemeB, teamDraft, teamPending, teamApproved, teamRejected, teamB,
			visitScheduled, visitB, issueOpen, issueResolved,
			deptProgress: { ...deptProgress, schemesTotal: totalsByDeptId[deptProgress.departmentId] },
			deptNoProgress: { ...deptNoProgress, schemesTotal: totalsByDeptId[deptNoProgress.departmentId] },
			progressSchemeA, progressSchemeB,
		};
	}, 45000); // several sequential round trips to the remote Supabase pooler + JWKS fetch on first login — bumped from 30000 once the Step 27 reconciliation fixture writes pushed it over that budget

	afterAll(async () => {
		if (!db) return; // beforeAll failed before db was even assigned — nothing to clean up
		if (f) {
			await db.query('delete from issue_reports where id in ($1,$2)', [f.issueOpen, f.issueResolved]);
			await db.query('delete from site_visits where id in ($1,$2)', [f.visitScheduled, f.visitB]);
			await db.query('delete from visit_team_members where team_id = $1', [f.teamApproved]);
			await db.query('delete from visit_teams where id in ($1,$2,$3,$4,$5)', [f.teamDraft, f.teamPending, f.teamApproved, f.teamRejected, f.teamB]);
			// Step 23/27 analytics + reconciliation fixtures — reset the progress values this suite wrote.
			await db.query('update schemes set physical_progress_pct = null, financial_progress_pct = null where id = any($1::bigint[])', [[...f.deptProgress.schemeIds, ...f.deptNoProgress.schemeIds, f.schemeB]]);
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
});
