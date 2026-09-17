/**
 * Integration: lead-MEO visit-form draft/save/submit workflow through the
 * real API, JWT verification, seeded templates, and live Supabase database.
 */
'use strict';

const { envAvailable } = require('../../helpers/envAvailable');
const { dbAvailable } = require('../../helpers/pgTestClient');

const maybeDescribe = envAvailable() && dbAvailable() ? describe : describe.skip;
jest.setTimeout(30000);

maybeDescribe('visit form fill routes', () => {
	let request;
	let app;
	let db;
	let getAccessToken;
	let getUserId;
	let meoToken;
	let supportToken;
	let fixture;

	beforeAll(async () => {
		request = require('supertest');
		app = require('../../../src/app');
		db = require('../../../src/config/database');
		({ getAccessToken, getUserId } = require('../../helpers/authToken'));

		meoToken = await getAccessToken('MEO');
		supportToken = await getAccessToken('SUPPORT_USER');
		const meoId = getUserId('MEO');
		const supportId = getUserId('SUPPORT_USER');
		const rdId = (await db.query('select id from users where email = $1', ['rd.test@mec.local'])).rows[0].id;
		const divisionId = (await db.query('select division_id from users where id = $1', [meoId])).rows[0].division_id;
		const scheme = (await db.query(
			`select s.id, s.department_id from schemes s
			 join scheme_districts sd on sd.scheme_id = s.id
			 join districts d on d.id = sd.district_id
			 where d.division_id = $1 limit 1`,
			[divisionId],
		)).rows[0];
		if (!scheme) throw new Error('No scheme found for the MEO test division — run `npm run seed:adp`');

		await db.query(`delete from site_visits where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2)`, [rdId, scheme.id]);
		await db.query(`delete from visit_team_members where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2)`, [rdId, scheme.id]);
		await db.query('delete from visit_teams where created_by = $1 and scheme_id = $2', [rdId, scheme.id]);

		const teamId = (await db.query(`insert into visit_teams (scheme_id, created_by, status) values ($1, $2, 'APPROVED') returning id`, [scheme.id, rdId])).rows[0].id;
		await db.query(`insert into visit_team_members (team_id, user_id, team_role) values ($1, $2, 'LEAD_MEO'), ($1, $3, 'DEPT_MEMBER')`, [teamId, meoId, supportId]);
		const visitId = (await db.query(`insert into site_visits (team_id, scheme_id, status) values ($1, $2, 'SCHEDULED') returning id`, [teamId, scheme.id])).rows[0].id;
		const template = (await db.query('select id from form_templates where department_id = $1 and is_active = true order by version desc limit 1', [scheme.department_id])).rows[0];
		if (!template) throw new Error('No active form template found — run `npm run seed:templates`');
		fixture = { teamId, visitId, templateId: template.id };
	}, 30000);

	afterAll(async () => {
		if (!db || !fixture) return;
		await db.query('delete from visit_forms where site_visit_id = $1', [fixture.visitId]);
		await db.query('delete from site_visits where id = $1', [fixture.visitId]);
		await db.query('delete from visit_team_members where team_id = $1', [fixture.teamId]);
		await db.query('delete from visit_teams where id = $1', [fixture.teamId]);
		await db.close();
	});

	test('lead MEO can save a draft and submit it with dynamic responses', async () => {
		const draft = await request(app)
			.put(`/api/v1/site-visits/${fixture.visitId}/form`)
			.set('Authorization', `Bearer ${meoToken}`)
			.send({ physicalProgressPct: 35, remarks: 'Foundation inspected', responses: {} });
		expect(draft.status).toBe(200);
		expect(draft.body.data.status).toBe('DRAFT');

		const submitted = await request(app)
			.post(`/api/v1/site-visits/${fixture.visitId}/form/submit`)
			.set('Authorization', `Bearer ${meoToken}`)
			.send({ physicalProgressPct: 40, remarks: 'Progress verified', responses: {} });
		expect(submitted.status).toBe(400);
		expect(submitted.body.error.message).toMatch(/Required form fields/);
	});

	test('non-lead team members can read but cannot edit the form', async () => {
		const read = await request(app)
			.get(`/api/v1/site-visits/${fixture.visitId}/form`)
			.set('Authorization', `Bearer ${supportToken}`);
		expect(read.status).toBe(200);
		expect(read.body.data.canEdit).toBe(false);

		const write = await request(app)
			.put(`/api/v1/site-visits/${fixture.visitId}/form`)
			.set('Authorization', `Bearer ${supportToken}`)
			.send({ physicalProgressPct: 40, responses: {} });
		expect(write.status).toBe(403);
	});

	test('lead MEO can submit a valid form once and later edits are rejected', async () => {
		const fields = (await db.query('select field_key, field_type, options, is_required from form_template_fields where template_id = $1 order by sort_order', [fixture.templateId])).rows;
		const responses = {};
		for (const field of fields) {
			if (!field.is_required) continue;
			responses[field.field_key] = field.field_type === 'boolean' ? true
				: field.field_type === 'number' ? 5
				: field.field_type === 'multiselect' ? [field.options[0]]
				: field.options ? field.options[0] : 'Observed';
		}
		const submitted = await request(app)
			.post(`/api/v1/site-visits/${fixture.visitId}/form/submit`)
			.set('Authorization', `Bearer ${meoToken}`)
			.send({ physicalProgressPct: 40, remarks: 'Final field report', responses });
		expect(submitted.status).toBe(200);
		expect(submitted.body.data.status).toBe('SUBMITTED');

		const edit = await request(app)
			.put(`/api/v1/site-visits/${fixture.visitId}/form`)
			.set('Authorization', `Bearer ${meoToken}`)
			.send({ physicalProgressPct: 41, responses });
		expect(edit.status).toBe(409);

		const stored = (await db.query('select status, physical_progress_pct, responses from visit_forms where site_visit_id = $1', [fixture.visitId])).rows[0];
		expect(stored.status).toBe('SUBMITTED');
		expect(Number(stored.physical_progress_pct)).toBe(40);
		expect(stored.responses).toEqual(responses);
	});
});