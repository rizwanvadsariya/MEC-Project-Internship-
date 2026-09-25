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

		f = { ...users, divisionA, schemeA, schemeB, teamDraft, teamPending, teamApproved, teamRejected, teamB, visitScheduled, visitB, issueOpen, issueResolved };
	}, 30000); // several sequential round trips to the remote Supabase pooler + JWKS fetch on first login

	afterAll(async () => {
		if (!db) return; // beforeAll failed before db was even assigned — nothing to clean up
		if (f) {
			await db.query('delete from issue_reports where id in ($1,$2)', [f.issueOpen, f.issueResolved]);
			await db.query('delete from site_visits where id in ($1,$2)', [f.visitScheduled, f.visitB]);
			await db.query('delete from visit_team_members where team_id = $1', [f.teamApproved]);
			await db.query('delete from visit_teams where id in ($1,$2,$3,$4,$5)', [f.teamDraft, f.teamPending, f.teamApproved, f.teamRejected, f.teamB]);
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
});
