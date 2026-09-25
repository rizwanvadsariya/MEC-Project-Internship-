/**
 * Integration: GET /api/v1/dashboards/member against the real live Supabase
 * project, via supertest + real JWTs (tests/helpers/authToken.js). Scoping
 * here is team-membership-based (not division-based, unlike
 * dashboards.routes.test.js's RD/DG suite), and must respect the same
 * "a DRAFT report is invisible to non-lead members until submitted" rule
 * Step 15 already enforces in visitForm.service/issue.service — this test
 * proves the dashboard rollup honors it too, not just the detail routes.
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

maybeDescribe('GET /api/v1/dashboards/member', () => {
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
			rd: 'rd.test@mec.local',
			meo: 'meo.test@mec.local',
			support: 'support.test@mec.local',
		})) {
			const { rows } = await db.query('select id from users where email = $1', [email]);
			if (!rows[0]) throw new Error(`Seeded test account missing: ${email} — run \`npm run seed:accounts\``);
			users[key] = rows[0].id;
		}

		const scheme = (await db.query('select id, department_id as "departmentId" from schemes limit 1')).rows[0];
		if (!scheme) throw new Error('No scheme found — run `npm run seed:adp`');
		const template = (await db.query(
			'select id from form_templates where department_id = $1 and is_active = true order by version desc limit 1',
			[scheme.departmentId],
		)).rows[0];
		if (!template) throw new Error('No active form template found — run `npm run seed:templates`');

		// Self-heal from a crashed prior run, same rationale as rlsFixtures.js.
		await db.query(`delete from issue_reports where site_visit_id in (select id from site_visits where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2))`, [users.rd, scheme.id]);
		await db.query(`delete from visit_forms where site_visit_id in (select id from site_visits where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2))`, [users.rd, scheme.id]);
		await db.query(`delete from site_visits where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2)`, [users.rd, scheme.id]);
		await db.query(`delete from visit_team_members where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2)`, [users.rd, scheme.id]);
		await db.query('delete from visit_teams where created_by = $1 and scheme_id = $2', [users.rd, scheme.id]);

		// Team A: MEO is lead, Support is a supporting member — two visits: one
		// with a still-DRAFT report (MEO's own working copy), one SUBMITTED.
		const teamA = (await db.query(`insert into visit_teams (scheme_id, created_by, status) values ($1,$2,'APPROVED') returning id`, [scheme.id, users.rd])).rows[0].id;
		await db.query(`insert into visit_team_members (team_id, user_id, team_role) values ($1,$2,'LEAD_MEO')`, [teamA, users.meo]);
		await db.query(`insert into visit_team_members (team_id, user_id, team_role) values ($1,$2,'DEPT_MEMBER')`, [teamA, users.support]);

		const visitDraft = (await db.query(`insert into site_visits (team_id, scheme_id, status) values ($1,$2,'SCHEDULED') returning id`, [teamA, scheme.id])).rows[0].id;
		await db.query(`insert into visit_forms (site_visit_id, template_id, filled_by, status) values ($1,$2,$3,'DRAFT')`, [visitDraft, template.id, users.meo]);
		const issueOnDraft = (await db.query(
			`insert into issue_reports (site_visit_id, reported_by, issue_type, severity, description) values ($1,$2,'Leak','MEDIUM','Draft-report issue') returning id`,
			[visitDraft, users.meo],
		)).rows[0].id;

		const visitSubmitted = (await db.query(`insert into site_visits (team_id, scheme_id, status) values ($1,$2,'SCHEDULED') returning id`, [teamA, scheme.id])).rows[0].id;
		await db.query(`insert into visit_forms (site_visit_id, template_id, filled_by, status) values ($1,$2,$3,'SUBMITTED')`, [visitSubmitted, template.id, users.meo]);
		const issueOnSubmitted = (await db.query(
			`insert into issue_reports (site_visit_id, reported_by, issue_type, severity, description) values ($1,$2,'Crack','HIGH','Submitted-report issue') returning id`,
			[visitSubmitted, users.meo],
		)).rows[0].id;

		// Team B: neither MEO nor Support is a member — proves scoping actually excludes it.
		const teamB = (await db.query(`insert into visit_teams (scheme_id, created_by, status) values ($1,$2,'APPROVED') returning id`, [scheme.id, users.rd])).rows[0].id;
		const visitForeign = (await db.query(`insert into site_visits (team_id, scheme_id, status) values ($1,$2,'SCHEDULED') returning id`, [teamB, scheme.id])).rows[0].id;
		const issueForeign = (await db.query(
			`insert into issue_reports (site_visit_id, reported_by, issue_type, severity, description) values ($1,$2,'Foreign','LOW','Not my team') returning id`,
			[visitForeign, users.rd],
		)).rows[0].id;

		f = { ...users, scheme: scheme.id, teamA, teamB, visitDraft, visitSubmitted, visitForeign, issueOnDraft, issueOnSubmitted, issueForeign };
	}, 30000); // several sequential round trips to the remote Supabase pooler + JWKS fetch on first login

	afterAll(async () => {
		if (!db) return; // beforeAll failed before db was even assigned — nothing to clean up
		if (f) {
			await db.query('delete from issue_reports where id in ($1,$2,$3)', [f.issueOnDraft, f.issueOnSubmitted, f.issueForeign]);
			await db.query('delete from visit_forms where site_visit_id in ($1,$2)', [f.visitDraft, f.visitSubmitted]);
			await db.query('delete from site_visits where id in ($1,$2,$3)', [f.visitDraft, f.visitSubmitted, f.visitForeign]);
			await db.query('delete from visit_team_members where team_id = $1', [f.teamA]);
			await db.query('delete from visit_teams where id in ($1,$2)', [f.teamA, f.teamB]);
		}
		await db.close();
	});

	test('rejects an unauthenticated request', async () => {
		const res = await request(app).get('/api/v1/dashboards/member');
		expect(res.status).toBe(401);
	});

	test('RD and DG are forbidden — this dashboard is MEO/Support only', async () => {
		const rdToken = await getAccessToken('REGIONAL_DIRECTOR');
		const rdRes = await request(app).get('/api/v1/dashboards/member').set('Authorization', `Bearer ${rdToken}`);
		expect(rdRes.status).toBe(403);

		const dgToken = await getAccessToken('DIRECTOR_GENERAL');
		const dgRes = await request(app).get('/api/v1/dashboards/member').set('Authorization', `Bearer ${dgToken}`);
		expect(dgRes.status).toBe(403);
	});

	test('MEO (lead) sees both assigned visits, a form due for the still-DRAFT one, both issues they reported, and both as visible-open (a lead always sees their own in-progress work)', async () => {
		const token = await getAccessToken('MEO');
		const res = await request(app).get('/api/v1/dashboards/member').set('Authorization', `Bearer ${token}`);

		expect(res.status).toBe(200);
		const { data } = res.body;

		expect(data.visits.total).toBeGreaterThanOrEqual(2);
		expect(data.formsDue).toBeGreaterThanOrEqual(1);
		expect(data.issues.reportedByMe).toBeGreaterThanOrEqual(2);
		expect(data.issues.open).toBeGreaterThanOrEqual(2);

		const visitIds = data.recentVisits.map((v) => v.id);
		expect(visitIds).toEqual(expect.arrayContaining([f.visitDraft, f.visitSubmitted]));
		expect(visitIds).not.toContain(f.visitForeign);

		const issueIds = data.recentIssues.map((i) => i.id);
		expect(issueIds).toEqual(expect.arrayContaining([f.issueOnDraft, f.issueOnSubmitted]));
		expect(issueIds).not.toContain(f.issueForeign);
	});

	test('SUPPORT_USER sees both assigned visits but the DRAFT-report issue stays invisible until submitted (Step 15\'s rule, now also enforced in the dashboard rollup)', async () => {
		const token = await getAccessToken('SUPPORT_USER');
		const res = await request(app).get('/api/v1/dashboards/member').set('Authorization', `Bearer ${token}`);

		expect(res.status).toBe(200);
		const { data } = res.body;

		expect(data.visits.total).toBeGreaterThanOrEqual(2);
		expect(data.formsDue).toBe(0); // a support user is never a LEAD_MEO
		expect(data.issues.reportedByMe).toBe(0); // only the lead MEO can file issues

		const visitIds = data.recentVisits.map((v) => v.id);
		expect(visitIds).toEqual(expect.arrayContaining([f.visitDraft, f.visitSubmitted]));
		expect(visitIds).not.toContain(f.visitForeign);

		const issueIds = data.recentIssues.map((i) => i.id);
		expect(issueIds).toContain(f.issueOnSubmitted);
		expect(issueIds).not.toContain(f.issueOnDraft);
		expect(issueIds).not.toContain(f.issueForeign);
	});
});
