'use strict';

const { envAvailable } = require('../../helpers/envAvailable');
const { dbAvailable } = require('../../helpers/pgTestClient');

const maybeDescribe = envAvailable() && dbAvailable() ? describe : describe.skip;
jest.setTimeout(30000);

maybeDescribe('issue report routes', () => {
	let request;
	let app;
	let db;
	let getAccessToken;
	let getUserId;
	let meoToken;
	let supportToken;
	let dgToken;
	let rdToken;
	let fixture;

	beforeAll(async () => {
		request = require('supertest');
		app = require('../../../src/app');
		db = require('../../../src/config/database');
		({ getAccessToken, getUserId } = require('../../helpers/authToken'));

		meoToken = await getAccessToken('MEO');
		supportToken = await getAccessToken('SUPPORT_USER');
		dgToken = await getAccessToken('DIRECTOR_GENERAL');
		rdToken = await getAccessToken('REGIONAL_DIRECTOR');
		const meoId = getUserId('MEO');
		const supportId = getUserId('SUPPORT_USER');
		const rdId = getUserId('REGIONAL_DIRECTOR');
		const divisionId = (await db.query('select division_id from users where id = $1', [meoId])).rows[0].division_id;
		const scheme = (await db.query(
			`select s.id from schemes s join scheme_districts sd on sd.scheme_id = s.id
			 join districts d on d.id = sd.district_id where d.division_id = $1 limit 1`,
			[divisionId],
		)).rows[0];
		if (!scheme) throw new Error('No scheme found — run `npm run seed:adp`');

		await db.query(`delete from issue_reports where site_visit_id in (select id from site_visits where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2))`, [rdId, scheme.id]);
		await db.query(`delete from site_visits where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2)`, [rdId, scheme.id]);
		await db.query(`delete from visit_team_members where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2)`, [rdId, scheme.id]);
		await db.query('delete from visit_teams where created_by = $1 and scheme_id = $2', [rdId, scheme.id]);

		const teamId = (await db.query(`insert into visit_teams (scheme_id, created_by, status) values ($1, $2, 'APPROVED') returning id`, [scheme.id, rdId])).rows[0].id;
		await db.query(`insert into visit_team_members (team_id, user_id, team_role) values ($1, $2, 'LEAD_MEO'), ($1, $3, 'DEPT_MEMBER')`, [teamId, meoId, supportId]);
		const visitId = (await db.query(`insert into site_visits (team_id, scheme_id, status) values ($1, $2, 'SCHEDULED') returning id`, [teamId, scheme.id])).rows[0].id;
		fixture = { teamId, visitId, divisionId };
	}, 30000);

	afterAll(async () => {
		if (!db || !fixture) return;
		await db.query('delete from issue_reports where site_visit_id = $1', [fixture.visitId]);
		await db.query('delete from site_visits where id = $1', [fixture.visitId]);
		await db.query('delete from visit_team_members where team_id = $1', [fixture.teamId]);
		await db.query('delete from visit_teams where id = $1', [fixture.teamId]);
		await db.close();
	});

	test('a non-lead member and a DG in-division cannot file, but the lead MEO can', async () => {
		const forbiddenSupport = await request(app)
			.post(`/api/v1/site-visits/${fixture.visitId}/issues`)
			.set('Authorization', `Bearer ${supportToken}`)
			.send({ issueType: 'Safety concern', severity: 'MEDIUM', description: 'Exposed rebar near the entrance.' });
		expect(forbiddenSupport.status).toBe(403);

		const forbiddenDg = await request(app)
			.post(`/api/v1/site-visits/${fixture.visitId}/issues`)
			.set('Authorization', `Bearer ${dgToken}`)
			.send({ issueType: 'Safety concern', severity: 'MEDIUM', description: 'Exposed rebar near the entrance.' });
		expect(forbiddenDg.status).toBe(403);

		const filed = await request(app)
			.post(`/api/v1/site-visits/${fixture.visitId}/issues`)
			.set('Authorization', `Bearer ${meoToken}`)
			.send({ issueType: 'Construction defect', severity: 'HIGH', description: 'Visible crack in the retaining wall.' });
		expect(filed.status).toBe(201);
		expect(filed.body.data).toMatchObject({ issueType: 'Construction defect', severity: 'HIGH', status: 'OPEN' });
		fixture.issueId = filed.body.data.id;

		const stored = (await db.query('select issue_type, severity, status from issue_reports where id = $1', [fixture.issueId])).rows[0];
		expect(stored).toMatchObject({ issue_type: 'Construction defect', severity: 'HIGH', status: 'OPEN' });
	});

	test('rejects an invalid severity and a missing description', async () => {
		const badSeverity = await request(app)
			.post(`/api/v1/site-visits/${fixture.visitId}/issues`)
			.set('Authorization', `Bearer ${meoToken}`)
			.send({ issueType: 'Delay', severity: 'EXTREME', description: 'Work has stalled for weeks.' });
		expect(badSeverity.status).toBe(400);

		const missingDescription = await request(app)
			.post(`/api/v1/site-visits/${fixture.visitId}/issues`)
			.set('Authorization', `Bearer ${meoToken}`)
			.send({ issueType: 'Delay', severity: 'LOW', description: '' });
		expect(missingDescription.status).toBe(400);
	});

	test('before submission, a filed issue is visible only to the lead MEO — not a support-team member or the division DG', async () => {
		const asSupport = await request(app)
			.get(`/api/v1/site-visits/${fixture.visitId}/issues`)
			.set('Authorization', `Bearer ${supportToken}`);
		expect(asSupport.status).toBe(200);
		expect(asSupport.body.data).toHaveLength(0);

		const asDg = await request(app)
			.get(`/api/v1/site-visits/${fixture.visitId}/issues`)
			.set('Authorization', `Bearer ${dgToken}`);
		expect(asDg.status).toBe(200);
		expect(asDg.body.data).toHaveLength(0);

		const asMeo = await request(app)
			.get(`/api/v1/site-visits/${fixture.visitId}/issues`)
			.set('Authorization', `Bearer ${meoToken}`);
		expect(asMeo.status).toBe(200);
		expect(asMeo.body.data).toHaveLength(1);
		expect(asMeo.body.data[0].id).toBe(fixture.issueId);
	});

	test('a non-lead member cannot delete, but the lead MEO can', async () => {
		const forbidden = await request(app)
			.delete(`/api/v1/site-visits/${fixture.visitId}/issues/${fixture.issueId}`)
			.set('Authorization', `Bearer ${supportToken}`);
		expect(forbidden.status).toBe(403);

		const removed = await request(app)
			.delete(`/api/v1/site-visits/${fixture.visitId}/issues/${fixture.issueId}`)
			.set('Authorization', `Bearer ${meoToken}`);
		expect(removed.status).toBe(204);

		const remaining = await db.query('select id from issue_reports where id = $1', [fixture.issueId]);
		expect(remaining.rows).toHaveLength(0);
	});

	test('once submitted, filing locks and the already-filed issue becomes visible to everyone', async () => {
		const refiled = await request(app)
			.post(`/api/v1/site-visits/${fixture.visitId}/issues`)
			.set('Authorization', `Bearer ${meoToken}`)
			.send({ issueType: 'Delay', severity: 'MEDIUM', description: 'Materials delivery is behind schedule.' });
		expect(refiled.status).toBe(201);
		const reportIssueId = refiled.body.data.id;

		const template = (await db.query(
			`select ft.id from form_templates ft join schemes s on s.department_id = ft.department_id
			 where s.id = (select scheme_id from site_visits where id = $1) and ft.is_active = true limit 1`,
			[fixture.visitId],
		)).rows[0];
		await db.query(
			`insert into visit_forms (site_visit_id, template_id, filled_by, status, physical_progress_pct, responses)
			 values ($1, $2, $3, 'SUBMITTED', 100, '{}'::jsonb)`,
			[fixture.visitId, template.id, getUserId('MEO')],
		);
		const locked = await request(app)
			.post(`/api/v1/site-visits/${fixture.visitId}/issues`)
			.set('Authorization', `Bearer ${meoToken}`)
			.send({ issueType: 'Late finding', severity: 'LOW', description: 'Found after the report was already locked.' });
		expect(locked.status).toBe(409);
		expect(locked.body.error.code).toBe('VISIT_REPORT_LOCKED');

		const asSupport = await request(app)
			.get(`/api/v1/site-visits/${fixture.visitId}/issues`)
			.set('Authorization', `Bearer ${supportToken}`);
		expect(asSupport.status).toBe(200);
		expect(asSupport.body.data.map((issue) => issue.id)).toContain(reportIssueId);

		const asDg = await request(app)
			.get(`/api/v1/site-visits/${fixture.visitId}/issues`)
			.set('Authorization', `Bearer ${dgToken}`);
		expect(asDg.status).toBe(200);
		expect(asDg.body.data.map((issue) => issue.id)).toContain(reportIssueId);

		await db.query('delete from visit_forms where site_visit_id = $1', [fixture.visitId]);
	});

	describe('issue lifecycle (Step 24)', () => {
		let lifecycleIssueId;

		beforeAll(async () => {
			const filed = await request(app)
				.post(`/api/v1/site-visits/${fixture.visitId}/issues`)
				.set('Authorization', `Bearer ${meoToken}`)
				.send({ issueType: 'Drainage blockage', severity: 'MEDIUM', description: 'Standing water near the main gate.' });
			expect(filed.status).toBe(201);
			lifecycleIssueId = filed.body.data.id;
		});

		afterAll(async () => {
			if (lifecycleIssueId) await db.query('delete from issue_reports where id = $1', [lifecycleIssueId]);
		});

		test('the lead MEO, a support member, and the DG are all forbidden — only the division RD may update lifecycle', async () => {
			const asMeo = await request(app)
				.patch(`/api/v1/site-visits/${fixture.visitId}/issues/${lifecycleIssueId}`)
				.set('Authorization', `Bearer ${meoToken}`)
				.send({ status: 'ACKNOWLEDGED' });
			expect(asMeo.status).toBe(403);

			const asSupport = await request(app)
				.patch(`/api/v1/site-visits/${fixture.visitId}/issues/${lifecycleIssueId}`)
				.set('Authorization', `Bearer ${supportToken}`)
				.send({ status: 'ACKNOWLEDGED' });
			expect(asSupport.status).toBe(403);

			const asDg = await request(app)
				.patch(`/api/v1/site-visits/${fixture.visitId}/issues/${lifecycleIssueId}`)
				.set('Authorization', `Bearer ${dgToken}`)
				.send({ status: 'ACKNOWLEDGED' });
			expect(asDg.status).toBe(403);
		});

		test('rejects an empty body and a malformed due date', async () => {
			const empty = await request(app)
				.patch(`/api/v1/site-visits/${fixture.visitId}/issues/${lifecycleIssueId}`)
				.set('Authorization', `Bearer ${rdToken}`)
				.send({});
			expect(empty.status).toBe(400);

			const badDate = await request(app)
				.patch(`/api/v1/site-visits/${fixture.visitId}/issues/${lifecycleIssueId}`)
				.set('Authorization', `Bearer ${rdToken}`)
				.send({ dueDate: '12/01/2026' });
			expect(badDate.status).toBe(400);
		});

		test('rejects a wrong-role owner (DG) before touching the row', async () => {
			const dgId = getUserId('DIRECTOR_GENERAL');
			const res = await request(app)
				.patch(`/api/v1/site-visits/${fixture.visitId}/issues/${lifecycleIssueId}`)
				.set('Authorization', `Bearer ${rdToken}`)
				.send({ ownerId: dgId });
			expect(res.status).toBe(400);
			expect(res.body.error.code).toBe('INVALID_ISSUE_OWNER');
		});

		test('the RD assigns an in-division MEO as owner and sets a due date in one call', async () => {
			const meoId = getUserId('MEO');
			const res = await request(app)
				.patch(`/api/v1/site-visits/${fixture.visitId}/issues/${lifecycleIssueId}`)
				.set('Authorization', `Bearer ${rdToken}`)
				.send({ ownerId: meoId, dueDate: '2026-12-15' });
			expect(res.status).toBe(200);
			expect(res.body.data).toMatchObject({ ownerId: meoId, dueDate: '2026-12-15', status: 'OPEN' });

			const stored = (await db.query('select owner_id, due_date::text as due_date from issue_reports where id = $1', [lifecycleIssueId])).rows[0];
			expect(stored).toMatchObject({ owner_id: meoId, due_date: '2026-12-15' });
		});

		test('clearing the due date and unassigning the owner both work via null', async () => {
			const res = await request(app)
				.patch(`/api/v1/site-visits/${fixture.visitId}/issues/${lifecycleIssueId}`)
				.set('Authorization', `Bearer ${rdToken}`)
				.send({ ownerId: null, dueDate: null });
			expect(res.status).toBe(200);
			expect(res.body.data).toMatchObject({ ownerId: null, dueDate: null });
		});

		test('advances OPEN -> ACKNOWLEDGED, stamping acknowledged_at, and a same/backward move is rejected', async () => {
			const advanced = await request(app)
				.patch(`/api/v1/site-visits/${fixture.visitId}/issues/${lifecycleIssueId}`)
				.set('Authorization', `Bearer ${rdToken}`)
				.send({ status: 'ACKNOWLEDGED' });
			expect(advanced.status).toBe(200);
			expect(advanced.body.data.status).toBe('ACKNOWLEDGED');

			const stored = (await db.query('select acknowledged_at from issue_reports where id = $1', [lifecycleIssueId])).rows[0];
			expect(stored.acknowledged_at).not.toBeNull();

			const repeat = await request(app)
				.patch(`/api/v1/site-visits/${fixture.visitId}/issues/${lifecycleIssueId}`)
				.set('Authorization', `Bearer ${rdToken}`)
				.send({ status: 'ACKNOWLEDGED' });
			expect(repeat.status).toBe(409);
			expect(repeat.body.error.code).toBe('ISSUE_INVALID_TRANSITION');
		});

		test('skips straight to RESOLVED, stamping resolved_at, and locks the issue against any further change', async () => {
			const resolved = await request(app)
				.patch(`/api/v1/site-visits/${fixture.visitId}/issues/${lifecycleIssueId}`)
				.set('Authorization', `Bearer ${rdToken}`)
				.send({ status: 'RESOLVED' });
			expect(resolved.status).toBe(200);
			expect(resolved.body.data.status).toBe('RESOLVED');

			const stored = (await db.query('select resolved_at, in_progress_at from issue_reports where id = $1', [lifecycleIssueId])).rows[0];
			expect(stored.resolved_at).not.toBeNull();
			expect(stored.in_progress_at).toBeNull(); // IN_PROGRESS was skipped entirely, never stamped

			const lockedUpdate = await request(app)
				.patch(`/api/v1/site-visits/${fixture.visitId}/issues/${lifecycleIssueId}`)
				.set('Authorization', `Bearer ${rdToken}`)
				.send({ dueDate: '2027-01-01' });
			expect(lockedUpdate.status).toBe(409);
			expect(lockedUpdate.body.error.code).toBe('ISSUE_RESOLVED_LOCKED');
		});

		test('404s for a nonexistent issue id and a nonexistent site visit id', async () => {
			const fakeIssue = await request(app)
				.patch(`/api/v1/site-visits/${fixture.visitId}/issues/00000000-0000-0000-0000-000000000000`)
				.set('Authorization', `Bearer ${rdToken}`)
				.send({ status: 'ACKNOWLEDGED' });
			expect(fakeIssue.status).toBe(404);

			const fakeVisit = await request(app)
				.patch(`/api/v1/site-visits/00000000-0000-0000-0000-000000000000/issues/${lifecycleIssueId}`)
				.set('Authorization', `Bearer ${rdToken}`)
				.send({ status: 'ACKNOWLEDGED' });
			expect(fakeVisit.status).toBe(404);
		});
	});
});
