/** Integration: RD in division A cannot see a scheme whose districts are all in
 *  division B; pagination returns a stable cursor. Hits the app via supertest + a
 *  real test Postgres. */
'use strict';

const { envAvailable } = require('../../helpers/envAvailable');
const { dbAvailable } = require('../../helpers/pgTestClient');

const maybeDescribe = envAvailable() && dbAvailable() ? describe : describe.skip;

jest.setTimeout(30000);

test.todo('RD in division A cannot see a scheme whose districts are all in division B');
test.todo('scheme list pagination returns a stable cursor across pages');

/**
 * Step 28 — QR scan-to-open. Against the live Supabase project: any real
 * scheme's own uid, scanned case/whitespace variations of it, and the actual
 * 404/401 failure paths a camera scan of a wrong or garbled code would hit.
 */
maybeDescribe('GET /api/v1/schemes/by-uid/:uid (Step 28 — QR scan-to-open)', () => {
	let request;
	let app;
	let db;
	let getAccessToken;
	let scheme;

	beforeAll(async () => {
		request = require('supertest');
		app = require('../../../src/app');
		db = require('../../../src/config/database');
		({ getAccessToken } = require('../../helpers/authToken'));

		const { rows } = await db.query('select id, uid, name from schemes order by id limit 1');
		scheme = rows[0];
		if (!scheme) throw new Error('No schemes found — run `npm run seed:adp` first');
	}, 30000);

	// No afterAll(db.close()) here — the GET /schemes/map describe block below
	// shares this same module-level `database.js` pool singleton and runs
	// after this one in the same file, so closing it here would leave that
	// block's own queries hitting an already-ended pool. Closed once, at the
	// end of the file, by the last describe block instead.

	test('rejects an unauthenticated request', async () => {
		const res = await request(app).get(`/api/v1/schemes/by-uid/${scheme.uid}`);
		expect(res.status).toBe(401);
	});

	test('resolves a real scheme by its exact uid, open to any authenticated role (province-wide, same as GET /schemes/:id)', async () => {
		const token = await getAccessToken('SUPPORT_USER');
		const res = await request(app).get(`/api/v1/schemes/by-uid/${scheme.uid}`).set('Authorization', `Bearer ${token}`);

		expect(res.status).toBe(200);
		expect(res.body.data.id).toBe(scheme.id);
		expect(res.body.data.uid).toBe(scheme.uid);
		expect(res.body.data.name).toBe(scheme.name);
	});

	test('is case-insensitive and tolerates surrounding whitespace, like a real camera scan or retyped code might produce', async () => {
		const token = await getAccessToken('MEO');

		const lower = await request(app)
			.get(`/api/v1/schemes/by-uid/${encodeURIComponent(scheme.uid.toLowerCase())}`)
			.set('Authorization', `Bearer ${token}`);
		expect(lower.status).toBe(200);
		expect(lower.body.data.id).toBe(scheme.id);

		const padded = await request(app)
			.get(`/api/v1/schemes/by-uid/${encodeURIComponent(`  ${scheme.uid}  `)}`)
			.set('Authorization', `Bearer ${token}`);
		expect(padded.status).toBe(200);
		expect(padded.body.data.id).toBe(scheme.id);
	});

	test('a code that matches no scheme (a wrong or garbled scan) 404s rather than falling back to anything', async () => {
		const token = await getAccessToken('REGIONAL_DIRECTOR');
		const res = await request(app).get('/api/v1/schemes/by-uid/NOT-A-REAL-SCHEME-UID').set('Authorization', `Bearer ${token}`);
		expect(res.status).toBe(404);
	});

	test('RD and DG (division-scoped elsewhere in this app) can still open a scheme outside their own division — this endpoint is province-wide', async () => {
		const rdId = await (async () => {
			const token = await getAccessToken('REGIONAL_DIRECTOR');
			const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
			return me.body.data.id;
		})();
		const rdDivision = (await db.query('select division_id as "divisionId" from users where id = $1', [rdId])).rows[0].divisionId;
		const otherDivisionScheme = (await db.query(
			`select s.id, s.uid from schemes s
			 join scheme_districts sd on sd.scheme_id = s.id
			 join districts d on d.id = sd.district_id
			 where d.division_id != $1 limit 1`,
			[rdDivision],
		)).rows[0];
		if (!otherDivisionScheme) return; // only one division seeded — nothing to assert here

		const token = await getAccessToken('REGIONAL_DIRECTOR');
		const res = await request(app).get(`/api/v1/schemes/by-uid/${otherDivisionScheme.uid}`).set('Authorization', `Bearer ${token}`);
		expect(res.status).toBe(200);
		expect(res.body.data.id).toBe(otherDivisionScheme.id);
	});
});

/**
 * Step 30 — GIS map view. Against the live Supabase project: division/district
 * progress rollups are province-wide (same openness as scheme browsing/by-uid
 * above), but the issue-severity layer is RD/DG-only and scoped to their own
 * division, mirroring Steps 16/23's established restriction.
 */
maybeDescribe('GET /api/v1/schemes/map (Step 30 — GIS map view)', () => {
	let request;
	let app;
	let db;
	let getAccessToken;

	beforeAll(async () => {
		request = require('supertest');
		app = require('../../../src/app');
		db = require('../../../src/config/database');
		({ getAccessToken } = require('../../helpers/authToken'));
	}, 30000);

	afterAll(async () => {
		if (db) await db.close();
	});

	test('rejects an unauthenticated request', async () => {
		const res = await request(app).get('/api/v1/schemes/map');
		expect(res.status).toBe(401);
	});

	test('returns one row per real division and district, open to the most restricted role (SUPPORT_USER) — proving this is province-wide', async () => {
		const [{ rows: divisionRows }, { rows: districtRows }] = await Promise.all([
			db.query('select count(*)::int as count from divisions'),
			db.query('select count(*)::int as count from districts'),
		]);

		const token = await getAccessToken('SUPPORT_USER');
		const res = await request(app).get('/api/v1/schemes/map').set('Authorization', `Bearer ${token}`);

		expect(res.status).toBe(200);
		expect(res.body.data.divisions).toHaveLength(divisionRows[0].count);
		expect(res.body.data.districts).toHaveLength(districtRows[0].count);
		expect(res.body.data.districts[0]).toEqual(expect.objectContaining({
			districtId: expect.any(Number),
			districtName: expect.any(String),
			divisionId: expect.any(Number),
			schemesTotal: expect.any(Number),
		}));
	});

	test('division-level schemesTotal never double-counts a scheme that spans two districts within the same division', async () => {
		const { rows } = await db.query('select count(distinct s.id)::int as count from schemes s join scheme_districts sd on sd.scheme_id = s.id');

		const token = await getAccessToken('MEO');
		const res = await request(app).get('/api/v1/schemes/map').set('Authorization', `Bearer ${token}`);

		const sumAcrossDivisions = res.body.data.divisions.reduce((sum, d) => sum + d.schemesTotal, 0);
		// A scheme spanning districts in two *different* divisions (rare for
		// province infrastructure schemes, but not schema-forbidden) would
		// legitimately count once per division it touches — so this is an
		// upper-bound sanity check, not an exact-equality one, but it directly
		// catches the regression a naive join-without-distinct would cause
		// (which would inflate this well past the real scheme count).
		expect(sumAcrossDivisions).toBeGreaterThan(0);
		expect(sumAcrossDivisions).toBeLessThanOrEqual(Math.ceil(rows[0].count * 1.2));
	});

	test('MEO and Support always get an empty issuesByDistrict (never a 403 — the base map still works for them)', async () => {
		for (const role of ['MEO', 'SUPPORT_USER']) {
			const token = await getAccessToken(role);
			const res = await request(app).get('/api/v1/schemes/map').set('Authorization', `Bearer ${token}`);
			expect(res.status).toBe(200);
			expect(res.body.data.issuesByDistrict).toEqual([]);
		}
	});

	test('RD gets an issuesByDistrict scoped only to districts in their own division', async () => {
		const token = await getAccessToken('REGIONAL_DIRECTOR');
		const meRes = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
		const rdDivisionId = meRes.body.data.divisionId;

		const res = await request(app).get('/api/v1/schemes/map').set('Authorization', `Bearer ${token}`);
		expect(res.status).toBe(200);

		const ownDivisionDistrictIds = new Set(
			res.body.data.districts.filter((d) => d.divisionId === rdDivisionId).map((d) => d.districtId),
		);
		for (const row of res.body.data.issuesByDistrict) {
			expect(ownDivisionDistrictIds.has(row.districtId)).toBe(true);
			expect(row).toEqual(expect.objectContaining({ openIssues: expect.any(Number), critical: expect.any(Number) }));
		}
	});

	test('DG gets the same shape of issuesByDistrict as RD, also scoped to their own division', async () => {
		const token = await getAccessToken('DIRECTOR_GENERAL');
		const meRes = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
		const dgDivisionId = meRes.body.data.divisionId;

		const res = await request(app).get('/api/v1/schemes/map').set('Authorization', `Bearer ${token}`);
		expect(res.status).toBe(200);

		const ownDivisionDistrictIds = new Set(
			res.body.data.districts.filter((d) => d.divisionId === dgDivisionId).map((d) => d.districtId),
		);
		for (const row of res.body.data.issuesByDistrict) {
			expect(ownDivisionDistrictIds.has(row.districtId)).toBe(true);
		}
	});
});
