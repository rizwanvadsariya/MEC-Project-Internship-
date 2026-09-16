/**
 * Integration: GET /site-visits and GET /site-visits/:id against the real
 * live Supabase project, via supertest + real JWTs minted through the real
 * login route (tests/helpers/authToken.js) — exercises authenticate.js's
 * real JWKS verification and authorize.js's real profile lookup, not a
 * mocked req.authUser. Fixtures are raw inserts (same style as
 * tests/helpers/rlsFixtures.js) since this only needs rows to exist, not the
 * team-assembly workflow that produced them.
 *
 * Gated on envAvailable() (requiring src/app is fatal with no backend/.env)
 * and dbAvailable() (DIRECT_URL reachable + the 4 seeded accounts exist, per
 * tests/globalSetup.js) — same signal the RLS suite relies on, so this skips
 * gracefully in CI instead of failing the whole run.
 */
'use strict';

const { envAvailable } = require('../../helpers/envAvailable');
const { dbAvailable } = require('../../helpers/pgTestClient');

const maybeDescribe = envAvailable() && dbAvailable() ? describe : describe.skip;

// Real network round trips (remote Supabase pooler + JWKS) — several seconds
// per first call, well past Jest's 5s default.
jest.setTimeout(30000);

maybeDescribe('GET /api/v1/site-visits, GET /api/v1/site-visits/:id', () => {
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
		await db.query(`delete from site_visits where team_id in (select id from visit_teams where created_by = $1 and scheme_id in ($2,$3))`, [users.rd, schemeA, schemeB]);
		await db.query(`delete from visit_team_members where team_id in (select id from visit_teams where created_by = $1 and scheme_id in ($2,$3))`, [users.rd, schemeA, schemeB]);
		await db.query('delete from visit_teams where created_by = $1 and scheme_id in ($2,$3)', [users.rd, schemeA, schemeB]);

		const teamA1 = (await db.query(`insert into visit_teams (scheme_id, created_by, status) values ($1,$2,'APPROVED') returning id`, [schemeA, users.rd])).rows[0].id;
		const teamA2 = (await db.query(`insert into visit_teams (scheme_id, created_by, status) values ($1,$2,'APPROVED') returning id`, [schemeA, users.rd])).rows[0].id;
		const teamB = (await db.query(`insert into visit_teams (scheme_id, created_by, status) values ($1,$2,'APPROVED') returning id`, [schemeB, users.rd])).rows[0].id;

		await db.query(`insert into visit_team_members (team_id, user_id, team_role) values ($1,$2,'LEAD_MEO')`, [teamA1, users.meo]);
		await db.query(`insert into visit_team_members (team_id, user_id, team_role) values ($1,$2,'DEPT_MEMBER')`, [teamA1, users.support]);

		const visitA1 = (await db.query(`insert into site_visits (team_id, scheme_id, status) values ($1,$2,'SCHEDULED') returning id`, [teamA1, schemeA])).rows[0].id;
		const visitA2 = (await db.query(`insert into site_visits (team_id, scheme_id, status) values ($1,$2,'SCHEDULED') returning id`, [teamA2, schemeA])).rows[0].id;
		const visitB = (await db.query(`insert into site_visits (team_id, scheme_id, status) values ($1,$2,'SCHEDULED') returning id`, [teamB, schemeB])).rows[0].id;

		f = { ...users, divisionA, schemeA, schemeB, teamA1, teamA2, teamB, visitA1, visitA2, visitB };
	}, 30000); // several sequential round trips to the remote Supabase pooler + JWKS fetch on first login

	afterAll(async () => {
		if (!db) return; // beforeAll failed before db was even assigned — nothing to clean up
		if (f) {
			await db.query('delete from site_visits where id in ($1,$2,$3)', [f.visitA1, f.visitA2, f.visitB]);
			await db.query('delete from visit_team_members where team_id in ($1,$2,$3)', [f.teamA1, f.teamA2, f.teamB]);
			await db.query('delete from visit_teams where id in ($1,$2,$3)', [f.teamA1, f.teamA2, f.teamB]);
		}
		await db.close();
	});

	test('rejects an unauthenticated request', async () => {
		const res = await request(app).get('/api/v1/site-visits');
		expect(res.status).toBe(401);
	});

	test('RD sees both division-A visits but not the other division\'s', async () => {
		const token = await getAccessToken('REGIONAL_DIRECTOR');
		const res = await request(app).get('/api/v1/site-visits').set('Authorization', `Bearer ${token}`);

		expect(res.status).toBe(200);
		const ids = res.body.data.map((v) => v.id);
		expect(ids).toEqual(expect.arrayContaining([f.visitA1, f.visitA2]));
		expect(ids).not.toContain(f.visitB);
	});

	test('DG sees both division-A visits but not the other division\'s', async () => {
		const token = await getAccessToken('DIRECTOR_GENERAL');
		const res = await request(app).get('/api/v1/site-visits').set('Authorization', `Bearer ${token}`);

		const ids = res.body.data.map((v) => v.id);
		expect(ids).toEqual(expect.arrayContaining([f.visitA1, f.visitA2]));
		expect(ids).not.toContain(f.visitB);
	});

	test('MEO sees only the visit they are a team member of, not their division\'s other visit', async () => {
		const token = await getAccessToken('MEO');
		const res = await request(app).get('/api/v1/site-visits').set('Authorization', `Bearer ${token}`);

		const ids = res.body.data.map((v) => v.id);
		expect(ids).toContain(f.visitA1);
		expect(ids).not.toContain(f.visitA2);
		expect(ids).not.toContain(f.visitB);
	});

	test('SUPPORT_USER (no division) sees only the visit they are a team member of', async () => {
		const token = await getAccessToken('SUPPORT_USER');
		const res = await request(app).get('/api/v1/site-visits').set('Authorization', `Bearer ${token}`);

		const ids = res.body.data.map((v) => v.id);
		expect(ids).toContain(f.visitA1);
		expect(ids).not.toContain(f.visitA2);
		expect(ids).not.toContain(f.visitB);
	});

	test('pagination: limit=1 returns a stable cursor that yields the remaining division-A visits with no duplicates', async () => {
		const token = await getAccessToken('REGIONAL_DIRECTOR');

		const page1 = await request(app).get('/api/v1/site-visits?limit=1&schemeId=' + f.schemeA).set('Authorization', `Bearer ${token}`);
		expect(page1.body.data).toHaveLength(1);
		expect(page1.body.meta.nextCursor).toBeTruthy();

		const page2 = await request(app)
			.get(`/api/v1/site-visits?limit=1&schemeId=${f.schemeA}&cursor=${encodeURIComponent(page1.body.meta.nextCursor)}`)
			.set('Authorization', `Bearer ${token}`);
		expect(page2.body.data).toHaveLength(1);

		const idsAcrossPages = [...page1.body.data, ...page2.body.data].map((v) => v.id);
		expect(new Set(idsAcrossPages).size).toBe(2);
		expect(idsAcrossPages.sort()).toEqual([f.visitA1, f.visitA2].sort());
	});

	test('detail: RD can fetch a division-A visit and sees its team members', async () => {
		const token = await getAccessToken('REGIONAL_DIRECTOR');
		const res = await request(app).get(`/api/v1/site-visits/${f.visitA1}`).set('Authorization', `Bearer ${token}`);

		expect(res.status).toBe(200);
		expect(res.body.data.id).toBe(f.visitA1);
		expect(res.body.data.members.map((m) => m.userId)).toEqual(expect.arrayContaining([f.meo, f.support]));
	});

	test('detail: RD requesting the other division\'s visit gets 404, not the row', async () => {
		const token = await getAccessToken('REGIONAL_DIRECTOR');
		const res = await request(app).get(`/api/v1/site-visits/${f.visitB}`).set('Authorization', `Bearer ${token}`);

		expect(res.status).toBe(404);
	});
});
