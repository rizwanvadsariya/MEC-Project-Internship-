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
		await db.query('delete from site_visits where id = $1', [fixture.visitId]);
		await db.query('delete from visit_team_members where team_id = $1', [fixture.teamId]);
		await db.query('delete from visit_teams where id = $1', [fixture.teamId]);
		await db.close();
	});

	test('lead MEO uploads a photo and a support member can list its signed URL', async () => {
		const upload = await request(app)
			.post(`/api/v1/site-visits/${fixture.visitId}/photos`)
			.set('Authorization', `Bearer ${meoToken}`)
			.field('caption', 'Front elevation')
			.attach('photo', ONE_PIXEL_PNG, { filename: 'visit.png', contentType: 'image/png' });
		expect(upload.status).toBe(201);
		expect(upload.body.data.storagePath).toMatch(new RegExp(`^${fixture.visitId}/`));
		fixture.storagePath = upload.body.data.storagePath;

		const listed = await request(app)
			.get(`/api/v1/site-visits/${fixture.visitId}/photos`)
			.set('Authorization', `Bearer ${supportToken}`);
		expect(listed.status).toBe(200);
		expect(listed.body.data).toHaveLength(1);
		expect(listed.body.data[0].signedUrl).toMatch(/^https?:\/\//);

		const stored = (await db.query('select storage_path, caption from visit_photos where site_visit_id = $1', [fixture.visitId])).rows[0];
		expect(stored.storage_path).toBe(fixture.storagePath);
		expect(stored.caption).toBe('Front elevation');
	});

	test('support user cannot upload and invalid MIME is rejected', async () => {
		const forbidden = await request(app)
			.post(`/api/v1/site-visits/${fixture.visitId}/photos`)
			.set('Authorization', `Bearer ${supportToken}`)
			.attach('photo', ONE_PIXEL_PNG, { filename: 'visit.png', contentType: 'image/png' });
		expect(forbidden.status).toBe(403);

		const invalid = await request(app)
			.post(`/api/v1/site-visits/${fixture.visitId}/photos`)
			.set('Authorization', `Bearer ${meoToken}`)
			.attach('photo', Buffer.from('not a photo'), { filename: 'notes.txt', contentType: 'text/plain' });
		expect(invalid.status).toBe(400);
	});

	test('lead MEO can delete a submitted photo', async () => {
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
});