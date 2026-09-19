/**
 * Integration: a support user is a real eligible team member (not just an
 * MEO) — this was a genuine gap found while verifying Step 15 ("view-only
 * access for other team members"): team.repo.findEligibleMembers used to
 * only return role='MEO' users and team.service.assertMemberIds required
 * every member (lead AND supporting) to be an MEO, so the seeded
 * support.test@mec.local account could never be added to any team through
 * the real app — meaning it could never see any site visit at all, since
 * visibility for MEO/SUPPORT_USER roles is team-membership-based. Fixed in
 * team.service.js/team.repo.js: the lead slot still must be an MEO, but a
 * supporting slot now accepts either an MEO (recorded as SUPPORT_MEO) or a
 * SUPPORT_USER (recorded as DEPT_MEMBER, per PRD.md's "supporting MEOs,
 * other-department staff" description of the role).
 */
'use strict';

const { envAvailable } = require('../../helpers/envAvailable');
const { dbAvailable } = require('../../helpers/pgTestClient');

const maybeDescribe = envAvailable() && dbAvailable() ? describe : describe.skip;
jest.setTimeout(30000);

maybeDescribe('team assembly with a support-user member', () => {
	let request;
	let app;
	let db;
	let getAccessToken;
	let getUserId;
	let rdToken;
	let dgToken;
	let meoId;
	let supportId;
	let schemeId;
	let teamId;
	let visitId;

	beforeAll(async () => {
		request = require('supertest');
		app = require('../../../src/app');
		db = require('../../../src/config/database');
		({ getAccessToken, getUserId } = require('../../helpers/authToken'));

		rdToken = await getAccessToken('REGIONAL_DIRECTOR');
		dgToken = await getAccessToken('DIRECTOR_GENERAL');
		await getAccessToken('MEO');
		await getAccessToken('SUPPORT_USER');
		meoId = getUserId('MEO');
		supportId = getUserId('SUPPORT_USER');
		const rdId = getUserId('REGIONAL_DIRECTOR');

		const rdDivision = (await db.query('select division_id as "divisionId" from users where id = $1', [rdId])).rows[0].divisionId;
		const scheme = await db.query(
			`select s.id from schemes s
			 join scheme_districts sd on sd.scheme_id = s.id
			 join districts d on d.id = sd.district_id
			 where d.division_id = $1 limit 1`,
			[rdDivision],
		);
		schemeId = scheme.rows[0]?.id;
		if (!schemeId) throw new Error('No scheme found in the RD test account\'s division — run `npm run seed:adp`');

		await db.query(`delete from site_visits where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2)`, [rdId, schemeId]);
		await db.query(`delete from team_approval_requests where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2)`, [rdId, schemeId]);
		await db.query(`delete from visit_team_members where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2)`, [rdId, schemeId]);
		await db.query('delete from visit_teams where created_by = $1 and scheme_id = $2', [rdId, schemeId]);
	});

	afterAll(async () => {
		if (!db) return;
		if (teamId) {
			await db.query('delete from issue_reports where site_visit_id = $1', [visitId]);
			await db.query('delete from visit_photos where site_visit_id = $1', [visitId]);
			await db.query('delete from visit_forms where site_visit_id = $1', [visitId]);
			await db.query('delete from site_visits where team_id = $1', [teamId]);
			await db.query('delete from team_approval_requests where team_id = $1', [teamId]);
			await db.query('delete from visit_team_members where team_id = $1', [teamId]);
			await db.query('delete from visit_teams where id = $1', [teamId]);
		}
		await db.close();
	});

	test('eligible-members includes the support user alongside MEOs', async () => {
		const eligible = await request(app).get('/api/v1/teams/eligible-members').set('Authorization', `Bearer ${rdToken}`);
		expect(eligible.status).toBe(200);
		const roles = eligible.body.data.map((member) => member.role);
		expect(roles).toContain('MEO');
		expect(roles).toContain('SUPPORT_USER');
		expect(eligible.body.data.some((member) => member.id === supportId)).toBe(true);
	});

	test('a support user cannot be the lead but can be a supporting member', async () => {
		const invalidLead = await request(app)
			.post('/api/v1/teams')
			.set('Authorization', `Bearer ${rdToken}`)
			.send({ schemeId, leadMeoId: supportId, supportingMemberIds: [] });
		expect(invalidLead.status).toBe(400);
		expect(invalidLead.body.error.code).toBe('INVALID_TEAM_MEMBER');

		const created = await request(app)
			.post('/api/v1/teams')
			.set('Authorization', `Bearer ${rdToken}`)
			.send({ schemeId, leadMeoId: meoId, supportingMemberIds: [supportId] });
		expect(created.status).toBe(201);
		teamId = created.body.data.id;
		const supportMember = created.body.data.members.find((member) => member.userId === supportId);
		expect(supportMember?.teamRole).toBe('DEPT_MEMBER');
	});

	test('once approved, the support member sees the visit, form, photos, and issues the lead MEO filed', async () => {
		const meoToken = await getAccessToken('MEO');
		const supportToken = await getAccessToken('SUPPORT_USER');

		const submitted = await request(app).post(`/api/v1/teams/${teamId}/submit`).set('Authorization', `Bearer ${rdToken}`);
		expect(submitted.status).toBe(200);

		const approved = await request(app)
			.post(`/api/v1/approvals/${teamId}/decision`)
			.set('Authorization', `Bearer ${dgToken}`)
			.send({ decision: 'APPROVED' });
		expect(approved.status).toBe(200);

		const visit = (await db.query('select id from site_visits where team_id = $1', [teamId])).rows[0];
		expect(visit).toBeTruthy();
		visitId = visit.id;

		// Before the lead MEO fills anything: the support member already sees the (empty) visit.
		const detailBeforeFill = await request(app).get(`/api/v1/site-visits/${visitId}`).set('Authorization', `Bearer ${supportToken}`);
		expect(detailBeforeFill.status).toBe(200);

		// The lead MEO saves a draft form, uploads a photo, and files an issue.
		const draft = await request(app)
			.put(`/api/v1/site-visits/${visitId}/form`)
			.set('Authorization', `Bearer ${meoToken}`)
			.send({ physicalProgressPct: 20, remarks: 'Site work underway', responses: {} });
		expect(draft.status).toBe(200);

		const issue = await request(app)
			.post(`/api/v1/site-visits/${visitId}/issues`)
			.set('Authorization', `Bearer ${meoToken}`)
			.send({ issueType: 'Delay', severity: 'MEDIUM', description: 'Materials delivery is behind schedule.' });
		expect(issue.status).toBe(201);

		// Before submission: the support member sees the visit exists, but not the
		// lead MEO's draft-in-progress form or the issue filed alongside it —
		// that's the lead's own working copy until they actually submit (Step 15 follow-up).
		const formReadBeforeSubmit = await request(app).get(`/api/v1/site-visits/${visitId}/form`).set('Authorization', `Bearer ${supportToken}`);
		expect(formReadBeforeSubmit.status).toBe(200);
		expect(formReadBeforeSubmit.body.data.form).toBeNull();
		expect(formReadBeforeSubmit.body.data.canEdit).toBe(false);

		const issuesReadBeforeSubmit = await request(app).get(`/api/v1/site-visits/${visitId}/issues`).set('Authorization', `Bearer ${supportToken}`);
		expect(issuesReadBeforeSubmit.status).toBe(200);
		expect(issuesReadBeforeSubmit.body.data).toHaveLength(0);

		// The lead MEO fills every required field and submits the report for real.
		const fields = (await db.query(
			`select ftf.field_key as "fieldKey", ftf.field_type as "fieldType", ftf.options, ftf.is_required as "isRequired"
			 from form_template_fields ftf
			 join form_templates ft on ft.id = ftf.template_id
			 join schemes s on s.department_id = ft.department_id
			 where s.id = $1 and ft.is_active = true order by ftf.sort_order`,
			[schemeId],
		)).rows;
		const responses = {};
		for (const field of fields) {
			if (!field.isRequired) continue;
			responses[field.fieldKey] = field.fieldType === 'boolean' ? true
				: field.fieldType === 'number' ? 5
				: field.fieldType === 'multiselect' ? [field.options[0]]
				: field.options ? field.options[0] : 'Observed';
		}
		const formSubmitted = await request(app)
			.post(`/api/v1/site-visits/${visitId}/form/submit`)
			.set('Authorization', `Bearer ${meoToken}`)
			.send({ physicalProgressPct: 20, remarks: 'Site work underway', responses });
		expect(formSubmitted.status).toBe(200);
		expect(formSubmitted.body.data.status).toBe('SUBMITTED');

		// Now that it's submitted, the support member sees the form, photos, and issue.
		const formRead = await request(app).get(`/api/v1/site-visits/${visitId}/form`).set('Authorization', `Bearer ${supportToken}`);
		expect(formRead.status).toBe(200);
		expect(Number(formRead.body.data.form.physicalProgressPct)).toBe(20);
		expect(formRead.body.data.canEdit).toBe(false);

		const photosRead = await request(app).get(`/api/v1/site-visits/${visitId}/photos`).set('Authorization', `Bearer ${supportToken}`);
		expect(photosRead.status).toBe(200);

		const issuesRead = await request(app).get(`/api/v1/site-visits/${visitId}/issues`).set('Authorization', `Bearer ${supportToken}`);
		expect(issuesRead.status).toBe(200);
		expect(issuesRead.body.data).toHaveLength(1);
		expect(issuesRead.body.data[0].issueType).toBe('Delay');

		// And it shows up in their site-visit list, not just the direct-id reads.
		const list = await request(app).get('/api/v1/site-visits').set('Authorization', `Bearer ${supportToken}`);
		expect(list.status).toBe(200);
		expect(list.body.data.some((item) => item.id === visitId)).toBe(true);
	});
});
