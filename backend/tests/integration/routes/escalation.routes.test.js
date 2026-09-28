/**
 * Integration: phases.md Step 25's two escalation rules, exercised through
 * the real HTTP flow against the live Supabase project.
 *
 *  1. Filing a CRITICAL issue notifies division leadership (RD+DG)
 *     immediately — even while the visit report is still an unsubmitted
 *     draft, unlike every other severity (see
 *     notificationTriggers.routes.test.js's own "still DRAFT" test for the
 *     non-CRITICAL baseline this deliberately breaks from).
 *  2. An issue whose due date has passed while unresolved escalates to the
 *     DG the next time the division dashboard loads — checked lazily
 *     (this project has no cron/queue infra), and exactly once per issue.
 *
 * Both triggers run via runInBackground (real, not mocked here) after the
 * HTTP response is sent, so waitForNotifications polls briefly rather than
 * asserting immediately — same tolerance as notificationTriggers.routes.test.js.
 */
'use strict';

const { envAvailable } = require('../../helpers/envAvailable');
const { dbAvailable } = require('../../helpers/pgTestClient');

const maybeDescribe = envAvailable() && dbAvailable() ? describe : describe.skip;

jest.setTimeout(45000);

async function waitForNotifications(db, { userId, title, relatedId }, { timeout = 5000, interval = 150 } = {}) {
	const deadline = Date.now() + timeout;
	const params = relatedId ? [userId, title, relatedId] : [userId, title];
	const clause = relatedId ? 'user_id = $1 and title = $2 and related_id = $3' : 'user_id = $1 and title = $2';
	for (;;) {
		const { rows } = await db.query(
			`select id, user_id as "userId", title, body, related_type as "relatedType", related_id as "relatedId" from notifications where ${clause}`,
			params,
		);
		if (rows.length) return rows;
		if (Date.now() >= deadline) return rows;
		await new Promise((resolve) => setTimeout(resolve, interval));
	}
}

maybeDescribe('escalation rules (Step 25)', () => {
	let request;
	let app;
	let db;
	let getAccessToken;
	let getUserId;
	let rdToken;
	let dgToken;
	let meoToken;
	let rdId;
	let dgId;
	let meoId;
	let schemeId;
	let f;

	beforeAll(async () => {
		request = require('supertest');
		app = require('../../../src/app');
		db = require('../../../src/config/database');
		({ getAccessToken, getUserId } = require('../../helpers/authToken'));

		rdToken = await getAccessToken('REGIONAL_DIRECTOR');
		dgToken = await getAccessToken('DIRECTOR_GENERAL');
		meoToken = await getAccessToken('MEO');
		rdId = getUserId('REGIONAL_DIRECTOR');
		dgId = getUserId('DIRECTOR_GENERAL');
		meoId = getUserId('MEO');

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

		// Self-heal from a crashed prior run — same rationale as
		// notificationTriggers.routes.test.js's own cleanup block.
		await db.query(
			`delete from notifications where user_id = any($1::uuid[]) and title = any($2::text[])`,
			[[rdId, dgId, meoId], ['CRITICAL issue reported', 'Issue overdue']],
		);
		await db.query(`delete from issue_reports where site_visit_id in (select id from site_visits where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2))`, [rdId, schemeId]);
		await db.query(`delete from site_visits where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2)`, [rdId, schemeId]);
		await db.query(`delete from visit_team_members where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2)`, [rdId, schemeId]);
		await db.query('delete from visit_teams where created_by = $1 and scheme_id = $2', [rdId, schemeId]);

		const teamId = (await db.query(`insert into visit_teams (scheme_id, created_by, status) values ($1,$2,'APPROVED') returning id`, [schemeId, rdId])).rows[0].id;
		await db.query(`insert into visit_team_members (team_id, user_id, team_role) values ($1,$2,'LEAD_MEO')`, [teamId, meoId]);
		const visitId = (await db.query(`insert into site_visits (team_id, scheme_id, status) values ($1,$2,'SCHEDULED') returning id`, [teamId, schemeId])).rows[0].id;

		f = { teamId, visitId };
	}, 30000);

	afterAll(async () => {
		if (!db || !f) return;
		await db.query('delete from issue_reports where site_visit_id = $1', [f.visitId]);
		await db.query('delete from site_visits where id = $1', [f.visitId]);
		await db.query('delete from visit_team_members where team_id = $1', [f.teamId]);
		await db.query('delete from visit_teams where id = $1', [f.teamId]);
		await db.close();
	});

	describe('rule #1 — CRITICAL issue escalates immediately, even pre-submission', () => {
		let criticalIssueId;

		afterAll(async () => {
			if (criticalIssueId) {
				await db.query('delete from notifications where related_id = $1', [criticalIssueId]);
				await db.query('delete from issue_reports where id = $1', [criticalIssueId]);
			}
		});

		test('filing a CRITICAL issue on an unsubmitted draft notifies RD and DG right away', async () => {
			const filed = await request(app)
				.post(`/api/v1/site-visits/${f.visitId}/issues`)
				.set('Authorization', `Bearer ${meoToken}`)
				.send({ issueType: 'Structural collapse risk', severity: 'CRITICAL', description: 'Load-bearing wall shows severe cracking.' });
			expect(filed.status).toBe(201);
			expect(filed.body.data.status).toBe('OPEN');
			criticalIssueId = filed.body.data.id;

			const rdNotifs = await waitForNotifications(db, { userId: rdId, title: 'CRITICAL issue reported', relatedId: criticalIssueId });
			expect(rdNotifs).toHaveLength(1);
			expect(rdNotifs[0].body).toMatch(/Structural collapse risk/);
			expect(rdNotifs[0].relatedType).toBe('ISSUE_REPORT');

			const dgNotifs = await waitForNotifications(db, { userId: dgId, title: 'CRITICAL issue reported', relatedId: criticalIssueId });
			expect(dgNotifs).toHaveLength(1);
		});

		test('a HIGH issue on the same still-unsubmitted draft is not escalated the same way', async () => {
			const filed = await request(app)
				.post(`/api/v1/site-visits/${f.visitId}/issues`)
				.set('Authorization', `Bearer ${meoToken}`)
				.send({ issueType: 'Minor crack', severity: 'HIGH', description: 'Cosmetic crack, not structural.' });
			expect(filed.status).toBe(201);
			const highIssueId = filed.body.data.id;

			const dgNotifs = await waitForNotifications(db, { userId: dgId, title: 'CRITICAL issue reported', relatedId: highIssueId }, { timeout: 1000 });
			expect(dgNotifs).toHaveLength(0);

			await db.query('delete from issue_reports where id = $1', [highIssueId]);
		});
	});

	describe('rule #2 — an overdue, unresolved issue escalates to the DG on the next dashboard load', () => {
		let overdueIssueId;

		afterAll(async () => {
			if (overdueIssueId) {
				await db.query('delete from notifications where related_id = $1', [overdueIssueId]);
				await db.query('delete from issue_reports where id = $1', [overdueIssueId]);
			}
		});

		test('an overdue issue is escalated exactly once, not re-fired on a later dashboard load', async () => {
			const created = (await db.query(
				`insert into issue_reports (site_visit_id, reported_by, issue_type, severity, description, status, due_date)
				 values ($1, $2, 'Drainage blockage', 'MEDIUM', 'Standing water near the site entrance.', 'ACKNOWLEDGED', current_date - 3)
				 returning id`,
				[f.visitId, meoId],
			)).rows[0];
			overdueIssueId = created.id;

			const firstLoad = await request(app).get('/api/v1/dashboards/division').set('Authorization', `Bearer ${rdToken}`);
			expect(firstLoad.status).toBe(200);

			const dgNotifs = await waitForNotifications(db, { userId: dgId, title: 'Issue overdue', relatedId: overdueIssueId });
			expect(dgNotifs).toHaveLength(1);
			expect(dgNotifs[0].body).toMatch(/Drainage blockage/);

			const escalated = (await db.query('select escalated_at from issue_reports where id = $1', [overdueIssueId])).rows[0];
			expect(escalated.escalated_at).not.toBeNull();

			// A second dashboard load (this time as the DG) must not re-fire —
			// escalated_at already excludes it from findOverdueUnescalated.
			const secondLoad = await request(app).get('/api/v1/dashboards/division').set('Authorization', `Bearer ${dgToken}`);
			expect(secondLoad.status).toBe(200);

			// Give any (incorrect) second dispatch a moment to land, then assert
			// there is still only ever the one row from the first load.
			await new Promise((resolve) => setTimeout(resolve, 1000));
			const { rows: allDgNotifs } = await db.query(
				'select id from notifications where user_id = $1 and title = $2 and related_id = $3',
				[dgId, 'Issue overdue', overdueIssueId],
			);
			expect(allDgNotifs).toHaveLength(1);
		});

		test('a resolved issue past its due date is never escalated', async () => {
			const created = (await db.query(
				`insert into issue_reports (site_visit_id, reported_by, issue_type, severity, description, status, due_date, resolved_at)
				 values ($1, $2, 'Fence repair', 'LOW', 'Fence was fixed on schedule.', 'RESOLVED', current_date - 10, now())
				 returning id`,
				[f.visitId, meoId],
			)).rows[0];

			const load = await request(app).get('/api/v1/dashboards/division').set('Authorization', `Bearer ${rdToken}`);
			expect(load.status).toBe(200);

			const dgNotifs = await waitForNotifications(db, { userId: dgId, title: 'Issue overdue', relatedId: created.id }, { timeout: 1000 });
			expect(dgNotifs).toHaveLength(0);

			await db.query('delete from issue_reports where id = $1', [created.id]);
		});

		test('an issue with a due date in the future is never escalated', async () => {
			const created = (await db.query(
				`insert into issue_reports (site_visit_id, reported_by, issue_type, severity, description, status, due_date)
				 values ($1, $2, 'Signage missing', 'LOW', 'Warning sign needs replacing.', 'OPEN', current_date + 10)
				 returning id`,
				[f.visitId, meoId],
			)).rows[0];

			const load = await request(app).get('/api/v1/dashboards/division').set('Authorization', `Bearer ${rdToken}`);
			expect(load.status).toBe(200);

			const dgNotifs = await waitForNotifications(db, { userId: dgId, title: 'Issue overdue', relatedId: created.id }, { timeout: 1000 });
			expect(dgNotifs).toHaveLength(0);

			await db.query('delete from issue_reports where id = $1', [created.id]);
		});
	});
});
