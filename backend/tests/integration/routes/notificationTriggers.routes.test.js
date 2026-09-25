/**
 * Integration: the three phases.md Step 17 triggers (team approved/rejected,
 * issue filed, visit completed), exercised through the real HTTP flow
 * against the live Supabase project — not the fire-and-forget dispatch
 * itself (that's unit-tested against mocks in notification.service.test.js),
 * but the end-to-end fact that a real submit/decide/file/submit call really
 * results in the right notification rows for the right users.
 *
 * The dispatch runs via runInBackground (real, not mocked here) *after* the
 * HTTP response is sent, so it is not yet written by the time supertest's
 * request() resolves — `waitForNotification` below polls briefly rather
 * than asserting immediately, the same tolerance any test of a real
 * background job needs.
 *
 * Gated the same way as tests/integration/routes/siteVisits.routes.test.js —
 * see that file's header for why.
 */
'use strict';

const { envAvailable } = require('../../helpers/envAvailable');
const { dbAvailable } = require('../../helpers/pgTestClient');

const maybeDescribe = envAvailable() && dbAvailable() ? describe : describe.skip;

// Several sequential HTTP round trips per test, some followed by a
// multi-second poll for the fire-and-forget background dispatch to land.
jest.setTimeout(45000);

// relatedId is optional but should be passed whenever the caller already
// knows it — title alone ("Team approved" etc) is not unique across runs,
// and a stale row from an earlier crashed run (afterAll never got to run)
// can otherwise be mistaken for the one this test just triggered.
async function waitForNotifications(db, { userId, title, relatedId }, { timeout = 5000, interval = 150 } = {}) {
	const deadline = Date.now() + timeout;
	const params = relatedId ? [userId, title, relatedId] : [userId, title];
	const clause = relatedId ? 'user_id = $1 and title = $2 and related_id = $3' : 'user_id = $1 and title = $2';
	for (;;) {
		const { rows } = await db.query(
			`select id, user_id as "userId", title, body, related_type as "relatedType", related_id as "relatedId" from notifications where ${clause}`,
			params,
		);
		if (rows.length) return rows;
		if (Date.now() >= deadline) return rows;
		await new Promise((resolve) => setTimeout(resolve, interval));
	}
}

maybeDescribe('notification triggers: team decision, visit completed, issue filed', () => {
	let request;
	let app;
	let db;
	let getAccessToken;
	let getUserId;
	let rdToken;
	let dgToken;
	let meoToken;
	let rdId;
	let dgId;
	let meoId;
	let supportId;
	let schemeId;
	let teamId;
	let visitId;
	let issueId;

	beforeAll(async () => {
		request = require('supertest');
		app = require('../../../src/app');
		db = require('../../../src/config/database');
		({ getAccessToken, getUserId } = require('../../helpers/authToken'));

		rdToken = await getAccessToken('REGIONAL_DIRECTOR');
		dgToken = await getAccessToken('DIRECTOR_GENERAL');
		meoToken = await getAccessToken('MEO');
		await getAccessToken('SUPPORT_USER');
		rdId = getUserId('REGIONAL_DIRECTOR');
		dgId = getUserId('DIRECTOR_GENERAL');
		meoId = getUserId('MEO');
		supportId = getUserId('SUPPORT_USER');

		const rdDivision = (await db.query('select division_id as "divisionId" from users where id = $1', [rdId])).rows[0].divisionId;
		const scheme = await db.query(
			`select s.id, s.department_id as "departmentId" from schemes s
			 join scheme_districts sd on sd.scheme_id = s.id
			 join districts d on d.id = sd.district_id
			 where d.division_id = $1 limit 1`,
			[rdDivision],
		);
		schemeId = scheme.rows[0]?.id;
		if (!schemeId) throw new Error('No scheme found in the RD test account\'s division — run `npm run seed:adp`');

		// Self-heal from a crashed prior run, same rationale as rlsFixtures.js.
		// A notification row has no FK to its team/visit/issue (related_id is
		// free text, not a real reference) — once a crashed run's parent row
		// is gone, a join-based cleanup can no longer find its orphaned
		// notification. This test's own trigger titles are specific enough
		// that a blanket delete for these 4 known test users is simpler and
		// actually robust against that class of leftover.
		await db.query(
			`delete from notifications where user_id = any($1::uuid[]) and title = any($2::text[])`,
			[[rdId, dgId, meoId, supportId], ['Team approved', 'Team rejected', 'Site visit completed', 'HIGH issue reported']],
		);
		await db.query(`delete from issue_reports where site_visit_id in (select id from site_visits where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2))`, [rdId, schemeId]);
		await db.query(`delete from visit_forms where site_visit_id in (select id from site_visits where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2))`, [rdId, schemeId]);
		await db.query(`delete from site_visits where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2)`, [rdId, schemeId]);
		await db.query(`delete from team_approval_requests where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2)`, [rdId, schemeId]);
		await db.query(`delete from visit_team_members where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2)`, [rdId, schemeId]);
		await db.query('delete from visit_teams where created_by = $1 and scheme_id = $2', [rdId, schemeId]);
	}, 30000);

	afterAll(async () => {
		if (!db) return;
		if (issueId) {
			await db.query('delete from notifications where related_id = $1', [issueId]);
		}
		if (visitId) {
			await db.query('delete from notifications where related_id = $1', [visitId]);
			await db.query('delete from issue_reports where site_visit_id = $1', [visitId]);
			await db.query('delete from visit_forms where site_visit_id = $1', [visitId]);
			await db.query('delete from site_visits where id = $1', [visitId]);
		}
		if (teamId) {
			await db.query('delete from notifications where related_id = $1', [teamId]);
			await db.query('delete from team_approval_requests where team_id = $1', [teamId]);
			await db.query('delete from visit_team_members where team_id = $1', [teamId]);
			await db.query('delete from visit_teams where id = $1', [teamId]);
		}
		await db.close();
	});

	test('team rejected notifies only the submitting RD', async () => {
		const created = await request(app)
			.post('/api/v1/teams')
			.set('Authorization', `Bearer ${rdToken}`)
			.send({ schemeId, leadMeoId: meoId, supportingMemberIds: [supportId] });
		expect(created.status).toBe(201);
		teamId = created.body.data.id;

		const submitted = await request(app).post(`/api/v1/teams/${teamId}/submit`).set('Authorization', `Bearer ${rdToken}`);
		expect(submitted.status).toBe(200);

		const rejected = await request(app)
			.post(`/api/v1/approvals/${teamId}/decision`)
			.set('Authorization', `Bearer ${dgToken}`)
			.send({ decision: 'REJECTED', remarks: 'Add justification before resubmitting' });
		expect(rejected.status).toBe(200);

		const rdNotifs = await waitForNotifications(db, { userId: rdId, title: 'Team rejected', relatedId: teamId });
		expect(rdNotifs).toHaveLength(1);

		const meoNotifs = await waitForNotifications(db, { userId: meoId, title: 'Team rejected', relatedId: teamId }, { timeout: 1000 });
		expect(meoNotifs).toHaveLength(0);
	});

	test('team approved notifies the RD and every team member, and creates the site visit', async () => {
		const resubmitted = await request(app).post(`/api/v1/teams/${teamId}/resubmit`).set('Authorization', `Bearer ${rdToken}`);
		expect(resubmitted.status).toBe(200);

		const approved = await request(app)
			.post(`/api/v1/approvals/${teamId}/decision`)
			.set('Authorization', `Bearer ${dgToken}`)
			.send({ decision: 'APPROVED' });
		expect(approved.status).toBe(200);

		const visit = (await db.query('select id from site_visits where team_id = $1', [teamId])).rows[0];
		expect(visit).toBeDefined();
		visitId = visit.id;

		const rdNotifs = await waitForNotifications(db, { userId: rdId, title: 'Team approved', relatedId: teamId });
		expect(rdNotifs).toHaveLength(1);
		const meoNotifs = await waitForNotifications(db, { userId: meoId, title: 'Team approved', relatedId: teamId });
		expect(meoNotifs).toHaveLength(1);
		const supportNotifs = await waitForNotifications(db, { userId: supportId, title: 'Team approved', relatedId: teamId });
		expect(supportNotifs).toHaveLength(1);
	});

	test('an issue filed while the report is still DRAFT does not notify anyone yet', async () => {
		const filed = await request(app)
			.post(`/api/v1/site-visits/${visitId}/issues`)
			.set('Authorization', `Bearer ${meoToken}`)
			.send({ issueType: 'Structural crack', severity: 'HIGH', description: 'Visible crack in the retaining wall' });
		expect(filed.status).toBe(201);
		issueId = filed.body.data.id;

		const supportNotifs = await waitForNotifications(db, { userId: supportId, title: 'HIGH issue reported', relatedId: issueId }, { timeout: 1000 });
		expect(supportNotifs).toHaveLength(0);
		const dgNotifs = await waitForNotifications(db, { userId: dgId, title: 'HIGH issue reported', relatedId: issueId }, { timeout: 1000 });
		expect(dgNotifs).toHaveLength(0);
	});

	test('submitting the visit form completes the visit and notifies the RD, division DG, and the rest of the team about the issue filed earlier', async () => {
		const department = (await db.query('select department_id as "departmentId" from schemes where id = $1', [schemeId])).rows[0].departmentId;
		const template = (await db.query(
			'select id from form_templates where department_id = $1 and is_active = true order by version desc limit 1',
			[department],
		)).rows[0];
		const fields = (await db.query('select field_key, field_type, options, is_required from form_template_fields where template_id = $1', [template.id])).rows;
		const responses = {};
		for (const field of fields) {
			if (!field.is_required) continue;
			responses[field.field_key] = field.field_type === 'boolean' ? true
				: field.field_type === 'number' ? 5
				: field.field_type === 'multiselect' ? [field.options[0]]
				: field.options ? field.options[0] : 'Observed';
		}

		const submitted = await request(app)
			.post(`/api/v1/site-visits/${visitId}/form/submit`)
			.set('Authorization', `Bearer ${meoToken}`)
			.send({ physicalProgressPct: 100, remarks: 'Final field report', responses });
		expect(submitted.status).toBe(200);
		expect(submitted.body.data.status).toBe('SUBMITTED');

		const visitRow = (await db.query('select status, completed_at as "completedAt" from site_visits where id = $1', [visitId])).rows[0];
		expect(visitRow.status).toBe('COMPLETED');
		expect(visitRow.completedAt).not.toBeNull();

		const rdNotifs = await waitForNotifications(db, { userId: rdId, title: 'Site visit completed', relatedId: visitId });
		expect(rdNotifs).toHaveLength(1);
		const dgNotifs = await waitForNotifications(db, { userId: dgId, title: 'Site visit completed', relatedId: visitId });
		expect(dgNotifs).toHaveLength(1);

		const issueNotifsForSupport = await waitForNotifications(db, { userId: supportId, title: 'HIGH issue reported', relatedId: issueId });
		expect(issueNotifsForSupport).toHaveLength(1);
		expect(issueNotifsForSupport[0].body).toMatch(/Structural crack/);
		const issueNotifsForDg = await waitForNotifications(db, { userId: dgId, title: 'HIGH issue reported', relatedId: issueId });
		expect(issueNotifsForDg).toHaveLength(1);
		// The lead MEO filed the issue themselves — no self-notification.
		const issueNotifsForMeo = await waitForNotifications(db, { userId: meoId, title: 'HIGH issue reported', relatedId: issueId }, { timeout: 1000 });
		expect(issueNotifsForMeo).toHaveLength(0);
	});
});
