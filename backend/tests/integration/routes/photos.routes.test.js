'use strict';

const { envAvailable } = require('../../helpers/envAvailable');
const { dbAvailable } = require('../../helpers/pgTestClient');

const maybeDescribe = envAvailable() && dbAvailable() ? describe : describe.skip;
jest.setTimeout(30000);

const ONE_PIXEL_PNG = Buffer.from(
	'89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360' +
	'000000020001e221bc330000000049454e44ae426082',
	'hex',
);

maybeDescribe('visit photo routes', () => {
	let request;
	let app;
	let db;
	let supabase;
	let config;
	let getAccessToken;
	let getUserId;
	let meoToken;
	let supportToken;
	let dgToken;
	let fixture;

	beforeAll(async () => {
		request = require('supertest');
		app = require('../../../src/app');
		db = require('../../../src/config/database');
		({ supabase } = require('../../../src/config/supabase'));
		({ config } = require('../../../src/config'));
		({ getAccessToken, getUserId } = require('../../helpers/authToken'));

		meoToken = await getAccessToken('MEO');
		supportToken = await getAccessToken('SUPPORT_USER');
		dgToken = await getAccessToken('DIRECTOR_GENERAL');
		const meoId = getUserId('MEO');
		const supportId = getUserId('SUPPORT_USER');
		const rdId = (await db.query('select id from users where email = $1', ['rd.test@mec.local'])).rows[0].id;
		const divisionId = (await db.query('select division_id from users where id = $1', [meoId])).rows[0].division_id;
		const scheme = (await db.query(
			`select s.id from schemes s join scheme_districts sd on sd.scheme_id = s.id
			 join districts d on d.id = sd.district_id where d.division_id = $1 limit 1`,
			[divisionId],
		)).rows[0];
		if (!scheme) throw new Error('No scheme found — run `npm run seed:adp`');

		await db.query(`delete from site_visits where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2)`, [rdId, scheme.id]);
		await db.query(`delete from visit_team_members where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2)`, [rdId, scheme.id]);
		await db.query('delete from visit_teams where created_by = $1 and scheme_id = $2', [rdId, scheme.id]);

		const teamId = (await db.query(`insert into visit_teams (scheme_id, created_by, status) values ($1, $2, 'APPROVED') returning id`, [scheme.id, rdId])).rows[0].id;
		await db.query(`insert into visit_team_members (team_id, user_id, team_role) values ($1, $2, 'LEAD_MEO'), ($1, $3, 'DEPT_MEMBER')`, [teamId, meoId, supportId]);
		const visitId = (await db.query(`insert into site_visits (team_id, scheme_id, status) values ($1, $2, 'SCHEDULED') returning id`, [teamId, scheme.id])).rows[0].id;
		fixture = { teamId, visitId, storagePath: null };
	}, 30000);

	afterAll(async () => {
		if (!db || !fixture) return;
		if (fixture.storagePath) await supabase.storage.from(config.STORAGE_BUCKET_VISIT_PHOTOS).remove([fixture.storagePath]);
		await db.query('delete from visit_photos where site_visit_id = $1', [fixture.visitId]);
		await db.query('delete from visit_forms where site_visit_id = $1', [fixture.visitId]);
		await db.query('delete from site_visits where id = $1', [fixture.visitId]);
		await db.query('delete from visit_team_members where team_id = $1', [fixture.teamId]);
		await db.query('delete from visit_teams where id = $1', [fixture.teamId]);
		await db.close();
	});

	test('lead MEO uploads a photo, but it stays invisible to others until the report is submitted', async () => {
		const upload = await request(app)
			.post(`/api/v1/site-visits/${fixture.visitId}/photos`)
			.set('Authorization', `Bearer ${meoToken}`)
			.field('caption', 'Front elevation')
			.attach('photo', ONE_PIXEL_PNG, { filename: 'visit.png', contentType: 'image/png' });
		expect(upload.status).toBe(201);
		expect(upload.body.data.storagePath).toMatch(new RegExp(`^${fixture.visitId}/`));
		fixture.storagePath = upload.body.data.storagePath;

		// Not submitted yet — a draft-in-progress's evidence photos are the lead
		// MEO's own working copy, invisible to everyone else until submitted.
		const listedBeforeSubmit = await request(app)
			.get(`/api/v1/site-visits/${fixture.visitId}/photos`)
			.set('Authorization', `Bearer ${supportToken}`);
		expect(listedBeforeSubmit.status).toBe(200);
		expect(listedBeforeSubmit.body.data).toHaveLength(0);

		const listedByDgBeforeSubmit = await request(app)
			.get(`/api/v1/site-visits/${fixture.visitId}/photos`)
			.set('Authorization', `Bearer ${dgToken}`);
		expect(listedByDgBeforeSubmit.status).toBe(200);
		expect(listedByDgBeforeSubmit.body.data).toHaveLength(0);

		// The lead MEO themselves can always see their own pending evidence.
		const listedByMeo = await request(app)
			.get(`/api/v1/site-visits/${fixture.visitId}/photos`)
			.set('Authorization', `Bearer ${meoToken}`);
		expect(listedByMeo.status).toBe(200);
		expect(listedByMeo.body.data).toHaveLength(1);

		const stored = (await db.query('select storage_path, caption from visit_photos where site_visit_id = $1', [fixture.visitId])).rows[0];
		expect(stored.storage_path).toBe(fixture.storagePath);
		expect(stored.caption).toBe('Front elevation');
	});

	test('support user and division DG cannot upload; invalid MIME is rejected', async () => {
		const forbidden = await request(app)
			.post(`/api/v1/site-visits/${fixture.visitId}/photos`)
			.set('Authorization', `Bearer ${supportToken}`)
			.attach('photo', ONE_PIXEL_PNG, { filename: 'visit.png', contentType: 'image/png' });
		expect(forbidden.status).toBe(403);

		const forbiddenDg = await request(app)
			.post(`/api/v1/site-visits/${fixture.visitId}/photos`)
			.set('Authorization', `Bearer ${dgToken}`)
			.attach('photo', ONE_PIXEL_PNG, { filename: 'visit.png', contentType: 'image/png' });
		expect(forbiddenDg.status).toBe(403);

		const invalid = await request(app)
			.post(`/api/v1/site-visits/${fixture.visitId}/photos`)
			.set('Authorization', `Bearer ${meoToken}`)
			.attach('photo', Buffer.from('not a photo'), { filename: 'notes.txt', contentType: 'text/plain' });
		expect(invalid.status).toBe(400);
	});

	test('lead MEO can delete a photo before the report is submitted', async () => {
		const row = (await db.query('select id, storage_path from visit_photos where site_visit_id = $1 limit 1', [fixture.visitId])).rows[0];
		expect(row).toBeTruthy();

		const removed = await request(app)
			.delete(`/api/v1/site-visits/${fixture.visitId}/photos/${row.id}`)
			.set('Authorization', `Bearer ${meoToken}`);
		expect(removed.status).toBe(204);

		const remaining = await db.query('select id from visit_photos where id = $1', [row.id]);
		expect(remaining.rows).toHaveLength(0);
		const storageCheck = await supabase.storage.from(config.STORAGE_BUCKET_VISIT_PHOTOS).download(row.storage_path);
		expect(storageCheck.error).toBeTruthy();
	});

	test('once the report is submitted, photos become visible to everyone', async () => {
		const upload = await request(app)
			.post(`/api/v1/site-visits/${fixture.visitId}/photos`)
			.set('Authorization', `Bearer ${meoToken}`)
			.field('caption', 'Final progress shot')
			.attach('photo', ONE_PIXEL_PNG, { filename: 'visit.png', contentType: 'image/png' });
		expect(upload.status).toBe(201);
		fixture.storagePath = upload.body.data.storagePath;

		const scheme = (await db.query('select department_id as "departmentId" from schemes where id = (select scheme_id from site_visits where id = $1)', [fixture.visitId])).rows[0];
		const template = (await db.query('select id from form_templates where department_id = $1 and is_active = true order by version desc limit 1', [scheme.departmentId])).rows[0];
		await db.query(
			`insert into visit_forms (site_visit_id, template_id, filled_by, status, physical_progress_pct, responses)
			 values ($1, $2, $3, 'SUBMITTED', 100, '{}'::jsonb)`,
			[fixture.visitId, template.id, getUserId('MEO')],
		);

		const listedBySupport = await request(app)
			.get(`/api/v1/site-visits/${fixture.visitId}/photos`)
			.set('Authorization', `Bearer ${supportToken}`);
		expect(listedBySupport.status).toBe(200);
		expect(listedBySupport.body.data).toHaveLength(1);
		expect(listedBySupport.body.data[0].signedUrl).toMatch(/^https?:\/\//);

		const listedByDg = await request(app)
			.get(`/api/v1/site-visits/${fixture.visitId}/photos`)
			.set('Authorization', `Bearer ${dgToken}`);
		expect(listedByDg.status).toBe(200);
		expect(listedByDg.body.data).toHaveLength(1);
	});
});