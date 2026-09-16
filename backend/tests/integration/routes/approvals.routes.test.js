/**
 * Integration: full submit -> reject -> revise -> resubmit -> approve loop,
 * with the audit trail row count asserted at each step, via supertest + real
 * JWTs (tests/helpers/authToken.js) hitting /teams and /approvals for real —
 * not mocked. Also the end-to-end proof that the site_visits auto-creation
 * this feature adds only fires on APPROVED, exactly once, at the end of the
 * real HTTP flow (the DB-level guard itself is unit-tested in
 * tests/integration/db/siteVisitCreation.test.js).
 *
 * Gated the same way as tests/integration/routes/siteVisits.routes.test.js —
 * see that file's header for why.
 */
'use strict';

const { envAvailable } = require('../../helpers/envAvailable');
const { dbAvailable } = require('../../helpers/pgTestClient');

const maybeDescribe = envAvailable() && dbAvailable() ? describe : describe.skip;

// Real network round trips (remote Supabase pooler + JWKS + a 5-step HTTP
// flow) — several seconds per call, well past Jest's 5s default.
jest.setTimeout(30000);

maybeDescribe('full submit -> reject -> revise -> resubmit -> approve loop', () => {
	let request;
	let app;
	let db;
	let getAccessToken;
	let getUserId;
	let rdToken;
	let dgToken;
	let meoId;
	let schemeId;
	let teamId;

	beforeAll(async () => {
		request = require('supertest');
		app = require('../../../src/app');
		db = require('../../../src/config/database');
		({ getAccessToken, getUserId } = require('../../helpers/authToken'));

		rdToken = await getAccessToken('REGIONAL_DIRECTOR');
		dgToken = await getAccessToken('DIRECTOR_GENERAL');
		await getAccessToken('MEO'); // populates getUserId('MEO') too
		meoId = getUserId('MEO');
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

		// Self-heal from a crashed prior run (same rationale as rlsFixtures.js).
		await db.query(`delete from site_visits where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2)`, [rdId, schemeId]);
		await db.query(`delete from team_approval_requests where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2)`, [rdId, schemeId]);
		await db.query(`delete from visit_team_members where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2)`, [rdId, schemeId]);
		await db.query('delete from visit_teams where created_by = $1 and scheme_id = $2', [rdId, schemeId]);
	});

	afterAll(async () => {
		if (!db) return; // beforeAll failed before db was even assigned — nothing to clean up
		if (teamId) {
			await db.query('delete from site_visits where team_id = $1', [teamId]);
			await db.query('delete from team_approval_requests where team_id = $1', [teamId]);
			await db.query('delete from visit_team_members where team_id = $1', [teamId]);
			await db.query('delete from visit_teams where id = $1', [teamId]);
		}
		await db.close();
	});

	test('full submit -> reject -> revise -> resubmit -> approve loop asserts the audit trail row count at each step', async () => {
		// 1. RD creates a draft team and submits it.
		const created = await request(app)
			.post('/api/v1/teams')
			.set('Authorization', `Bearer ${rdToken}`)
			.send({ schemeId, leadMeoId: meoId, supportingMemberIds: [] });
		expect(created.status).toBe(201);
		teamId = created.body.data.id;

		const submitted = await request(app).post(`/api/v1/teams/${teamId}/submit`).set('Authorization', `Bearer ${rdToken}`);
		expect(submitted.status).toBe(200);
		expect(submitted.body.data.status).toBe('PENDING_APPROVAL');

		let auditRows = await db.query('select decision from team_approval_requests where team_id = $1 order by submitted_at', [teamId]);
		expect(auditRows.rows).toHaveLength(1);
		expect(auditRows.rows[0].decision).toBe('PENDING');

		// 2. DG rejects it with remarks.
		const rejected = await request(app)
			.post(`/api/v1/approvals/${teamId}/decision`)
			.set('Authorization', `Bearer ${dgToken}`)
			.send({ decision: 'REJECTED', remarks: 'Add a supporting MEO before resubmitting' });
		expect(rejected.status).toBe(200);
		expect(rejected.body.data.decision).toBe('REJECTED');

		auditRows = await db.query('select decision from team_approval_requests where team_id = $1 order by submitted_at', [teamId]);
		expect(auditRows.rows.map((r) => r.decision)).toEqual(['REJECTED']);

		let noVisit = await db.query('select id from site_visits where team_id = $1', [teamId]);
		expect(noVisit.rows).toHaveLength(0);

		// 3. RD revises (adds a supporting member isn't required by validation —
		// resubmit alone is enough to exercise the version bump) and resubmits.
		const resubmitted = await request(app).post(`/api/v1/teams/${teamId}/resubmit`).set('Authorization', `Bearer ${rdToken}`);
		expect(resubmitted.status).toBe(200);
		expect(resubmitted.body.data.status).toBe('PENDING_APPROVAL');
		expect(resubmitted.body.data.version).toBe(2);

		auditRows = await db.query('select decision from team_approval_requests where team_id = $1 order by submitted_at', [teamId]);
		expect(auditRows.rows.map((r) => r.decision)).toEqual(['REJECTED', 'PENDING']);

		// 4. DG approves — this is the step that must create exactly one site_visit.
		const approved = await request(app)
			.post(`/api/v1/approvals/${teamId}/decision`)
			.set('Authorization', `Bearer ${dgToken}`)
			.send({ decision: 'APPROVED' });
		expect(approved.status).toBe(200);
		expect(approved.body.data.decision).toBe('APPROVED');

		auditRows = await db.query('select decision from team_approval_requests where team_id = $1 order by submitted_at', [teamId]);
		expect(auditRows.rows.map((r) => r.decision)).toEqual(['REJECTED', 'APPROVED']);

		const visits = await db.query('select id, scheme_id as "schemeId", status from site_visits where team_id = $1', [teamId]);
		expect(visits.rows).toHaveLength(1);
		expect(visits.rows[0].schemeId).toBe(schemeId);
		expect(visits.rows[0].status).toBe('SCHEDULED');

		// 5. The newly-created visit is now reachable through GET /site-visits/:id.
		const visitDetail = await request(app).get(`/api/v1/site-visits/${visits.rows[0].id}`).set('Authorization', `Bearer ${rdToken}`);
		expect(visitDetail.status).toBe(200);
		expect(visitDetail.body.data.teamId).toBe(teamId);
	});
});
