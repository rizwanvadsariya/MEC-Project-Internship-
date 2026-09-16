/**
 * Integration: siteVisit.repo.createForApprovedTeam against the real live
 * Supabase project (the same DATABASE_URL the app itself uses — not the RLS
 * suite's disposable role-simulation client, since this exercises the app's
 * own `postgres`-role write path). Gated on tests/helpers/pgTestClient's
 * dbAvailable() (set by tests/globalSetup.js) so it skips gracefully with no
 * backend/.env, e.g. in CI — same signal the RLS suite already relies on.
 * Requires are lazy (inside beforeAll) so requiring src/config never happens
 * unless dbAvailable() already confirmed .env is usable — see
 * tests/helpers/envAvailable.js for why that matters.
 */
'use strict';

const { dbAvailable } = require('../../helpers/pgTestClient');

const maybeDescribe = dbAvailable() ? describe : describe.skip;

maybeDescribe('siteVisit.repo.createForApprovedTeam', () => {
	let db;
	let siteVisitRepo;
	let teamId;
	let schemeId;

	beforeAll(async () => {
		db = require('../../../src/config/database');
		siteVisitRepo = require('../../../src/repositories/siteVisit.repo');

		const rd = await db.query(`select id from users where email = 'rd.test@mec.local'`);
		const rdId = rd.rows[0]?.id;
		if (!rdId) throw new Error('Seeded RD test account missing — run `npm run seed:accounts`');

		const scheme = await db.query('select id from schemes limit 1');
		schemeId = scheme.rows[0]?.id;
		if (!schemeId) throw new Error('No schemes found — run `npm run seed:adp`');

		// Self-heal from a run that crashed between creating this fixture and
		// cleaning it up (rlsFixtures.js hit exactly this once — see Memory.md).
		await db.query(
			`delete from site_visits where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2)`,
			[rdId, schemeId],
		);
		await db.query('delete from visit_teams where created_by = $1 and scheme_id = $2', [rdId, schemeId]);

		const team = await db.query(
			`insert into visit_teams (scheme_id, created_by, status) values ($1, $2, 'APPROVED') returning id`,
			[schemeId, rdId],
		);
		teamId = team.rows[0].id;
	});

	afterAll(async () => {
		if (!db) return; // beforeAll failed before db was even assigned — nothing to clean up
		if (teamId) {
			await db.query('delete from site_visits where team_id = $1', [teamId]);
			await db.query('delete from visit_teams where id = $1', [teamId]);
		}
		await db.close();
	});

	async function runInTransaction(fn) {
		const client = await db.pool.connect();
		try {
			await client.query('begin');
			await fn(client);
			await client.query('commit');
		} catch (err) {
			await client.query('rollback');
			throw err;
		} finally {
			client.release();
		}
	}

	test('creates exactly one SCHEDULED site_visit for a newly-approved team, matching its scheme', async () => {
		await runInTransaction((client) => siteVisitRepo.createForApprovedTeam(client, teamId));

		const { rows } = await db.query(
			'select id, team_id as "teamId", scheme_id as "schemeId", status from site_visits where team_id = $1',
			[teamId],
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].schemeId).toBe(schemeId);
		expect(rows[0].status).toBe('SCHEDULED');
	});

	test('calling it again for the same team is a no-op — still exactly one site_visit (the guard approval.repo.decide relies on to stay idempotent under a double-approve)', async () => {
		await runInTransaction((client) => siteVisitRepo.createForApprovedTeam(client, teamId));
		await runInTransaction((client) => siteVisitRepo.createForApprovedTeam(client, teamId));

		const { rows } = await db.query('select id from site_visits where team_id = $1', [teamId]);
		expect(rows).toHaveLength(1);
	});
});
