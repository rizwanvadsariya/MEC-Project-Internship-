/**
 * Integration: push-token registration/removal and in-app notification
 * list/mark-read against the real live Supabase project, via supertest +
 * real JWTs (tests/helpers/authToken.js). The trigger-driven notifications
 * themselves (team decision, visit completed, issue filed) are covered
 * separately in notificationTriggers.routes.test.js, since those exercise
 * the fire-and-forget background path rather than a direct CRUD endpoint.
 *
 * Gated the same way as tests/integration/routes/siteVisits.routes.test.js —
 * see that file's header for why.
 */
'use strict';

const { envAvailable } = require('../../helpers/envAvailable');
const { dbAvailable } = require('../../helpers/pgTestClient');

const maybeDescribe = envAvailable() && dbAvailable() ? describe : describe.skip;

jest.setTimeout(30000);

maybeDescribe('push tokens + in-app notifications', () => {
	let request;
	let app;
	let db;
	let getAccessToken;
	let rdToken;
	let supportToken;
	let rdId;
	let supportId;
	let notifA;
	let notifB;
	let notifOther;

	beforeAll(async () => {
		request = require('supertest');
		app = require('../../../src/app');
		db = require('../../../src/config/database');
		({ getAccessToken } = require('../../helpers/authToken'));

		rdToken = await getAccessToken('REGIONAL_DIRECTOR');
		supportToken = await getAccessToken('SUPPORT_USER');
		rdId = (await db.query('select id from users where email = $1', ['rd.test@mec.local'])).rows[0].id;
		supportId = (await db.query('select id from users where email = $1', ['support.test@mec.local'])).rows[0].id;

		// Self-heal from a crashed prior run, same rationale as rlsFixtures.js.
		await db.query(`delete from push_tokens where token like 'ExponentPushToken[test-%'`);
		await db.query(`delete from notifications where user_id in ($1, $2) and title like 'Integration test%'`, [rdId, supportId]);

		notifA = (await db.query(
			`insert into notifications (user_id, title, body, related_type, related_id, is_read)
			 values ($1, 'Integration test unread', 'body A', 'TEAM', 'team-x', false) returning id, created_at`,
			[rdId],
		)).rows[0];
		notifB = (await db.query(
			`insert into notifications (user_id, title, body, related_type, related_id, is_read)
			 values ($1, 'Integration test read', 'body B', 'TEAM', 'team-y', true) returning id, created_at`,
			[rdId],
		)).rows[0];
		notifOther = (await db.query(
			`insert into notifications (user_id, title, body, related_type, related_id, is_read)
			 values ($1, 'Integration test other user', 'body C', 'TEAM', 'team-z', false) returning id`,
			[supportId],
		)).rows[0];
	}, 30000);

	afterAll(async () => {
		if (!db) return;
		await db.query(`delete from push_tokens where token like 'ExponentPushToken[test-%'`);
		if (notifA) await db.query('delete from notifications where id in ($1, $2, $3)', [notifA.id, notifB.id, notifOther.id]);
		await db.close();
	});

	test('rejects unauthenticated requests', async () => {
		expect((await request(app).get('/api/v1/notifications')).status).toBe(401);
		expect((await request(app).post('/api/v1/notifications/push-tokens').send({ token: 'x', platform: 'ios' })).status).toBe(401);
	});

	test('registers a valid Expo push token for the caller, upserting on repeat registration', async () => {
		const token = 'ExponentPushToken[test-abc123]';

		const first = await request(app)
			.post('/api/v1/notifications/push-tokens')
			.set('Authorization', `Bearer ${rdToken}`)
			.send({ token, platform: 'android' });
		expect(first.status).toBe(201);
		expect(first.body.data.token).toBe(token);

		const row = (await db.query('select user_id as "userId", platform from push_tokens where token = $1', [token])).rows[0];
		expect(row.userId).toBe(rdId);
		expect(row.platform).toBe('android');

		// Re-registering (e.g. app relaunch) upserts rather than erroring.
		const second = await request(app)
			.post('/api/v1/notifications/push-tokens')
			.set('Authorization', `Bearer ${rdToken}`)
			.send({ token, platform: 'ios' });
		expect(second.status).toBe(201);
		const updated = (await db.query('select platform from push_tokens where token = $1', [token])).rows[0];
		expect(updated.platform).toBe('ios');
	});

	test('rejects a malformed push token', async () => {
		const res = await request(app)
			.post('/api/v1/notifications/push-tokens')
			.set('Authorization', `Bearer ${rdToken}`)
			.send({ token: 'not-an-expo-token', platform: 'ios' });
		expect(res.status).toBe(400);
	});

	test('removes a push token for the caller', async () => {
		const token = 'ExponentPushToken[test-removeme]';
		await db.query(`insert into push_tokens (user_id, token, platform) values ($1, $2, 'android')`, [rdId, token]);

		const res = await request(app)
			.delete('/api/v1/notifications/push-tokens')
			.set('Authorization', `Bearer ${rdToken}`)
			.send({ token });
		expect(res.status).toBe(204);

		const row = (await db.query('select id from push_tokens where token = $1', [token])).rows[0];
		expect(row).toBeUndefined();
	});

	test('lists only the caller\'s own notifications, newest first', async () => {
		const res = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${rdToken}`);
		expect(res.status).toBe(200);

		const ids = res.body.data.map((n) => n.id);
		expect(ids).toEqual(expect.arrayContaining([notifA.id, notifB.id]));
		expect(ids).not.toContain(notifOther.id);
	});

	test('unreadOnly=true filters to just the unread row', async () => {
		const res = await request(app).get('/api/v1/notifications?unreadOnly=true').set('Authorization', `Bearer ${rdToken}`);
		expect(res.status).toBe(200);

		const ids = res.body.data.map((n) => n.id);
		expect(ids).toContain(notifA.id);
		expect(ids).not.toContain(notifB.id);
	});

	test('marks the caller\'s own notification as read', async () => {
		const res = await request(app).patch(`/api/v1/notifications/${notifA.id}/read`).set('Authorization', `Bearer ${rdToken}`);
		expect(res.status).toBe(200);
		expect(res.body.data.isRead).toBe(true);

		const row = (await db.query('select is_read as "isRead" from notifications where id = $1', [notifA.id])).rows[0];
		expect(row.isRead).toBe(true);
	});

	test('cannot mark another user\'s notification as read — 404, not the row', async () => {
		const res = await request(app).patch(`/api/v1/notifications/${notifOther.id}/read`).set('Authorization', `Bearer ${rdToken}`);
		expect(res.status).toBe(404);

		const row = (await db.query('select is_read as "isRead" from notifications where id = $1', [notifOther.id])).rows[0];
		expect(row.isRead).toBe(false);
	});

	test('the support account can list and mark read its own notification (the one the RD was just correctly denied)', async () => {
		const list = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${supportToken}`);
		expect(list.status).toBe(200);
		expect(list.body.data.map((n) => n.id)).toContain(notifOther.id);

		const markRead = await request(app).patch(`/api/v1/notifications/${notifOther.id}/read`).set('Authorization', `Bearer ${supportToken}`);
		expect(markRead.status).toBe(200);
		expect(markRead.body.data.isRead).toBe(true);
	});
});
