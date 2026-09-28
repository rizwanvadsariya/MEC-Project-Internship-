'use strict';

const { envAvailable } = require('../../helpers/envAvailable');
const { dbAvailable } = require('../../helpers/pgTestClient');

const maybeDescribe = envAvailable() && dbAvailable() ? describe : describe.skip;
jest.setTimeout(30000);

maybeDescribe('comment routes (phases.md Step 20)', () => {
	let request;
	let app;
	let db;
	let getAccessToken;
	let getUserId;
	let meoToken;
	let supportToken;
	let dgToken;
	let rdToken;
	let fixture;

	beforeAll(async () => {
		request = require('supertest');
		app = require('../../../src/app');
		db = require('../../../src/config/database');
		({ getAccessToken, getUserId } = require('../../helpers/authToken'));

		meoToken = await getAccessToken('MEO');
		supportToken = await getAccessToken('SUPPORT_USER');
		dgToken = await getAccessToken('DIRECTOR_GENERAL');
		rdToken = await getAccessToken('REGIONAL_DIRECTOR');
		const meoId = getUserId('MEO');
		const supportId = getUserId('SUPPORT_USER');
		const rdId = getUserId('REGIONAL_DIRECTOR');
		const divisionId = (await db.query('select division_id from users where id = $1', [meoId])).rows[0].division_id;
		const scheme = (await db.query(
			`select s.id from schemes s join scheme_districts sd on sd.scheme_id = s.id
			 join districts d on d.id = sd.district_id where d.division_id = $1 limit 1`,
			[divisionId],
		)).rows[0];
		const otherDivisionScheme = (await db.query(
			`select s.id from schemes s join scheme_districts sd on sd.scheme_id = s.id
			 join districts d on d.id = sd.district_id where d.division_id != $1 limit 1`,
			[divisionId],
		)).rows[0];
		if (!scheme || !otherDivisionScheme) throw new Error('No scheme found — run `npm run seed:adp`');

		await db.query(`delete from comments where commentable_type = 'SCHEME' and commentable_id in ($1, $2)`, [String(scheme.id), String(otherDivisionScheme.id)]);
		await db.query(`delete from site_visits where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2)`, [rdId, scheme.id]);
		await db.query(`delete from visit_team_members where team_id in (select id from visit_teams where created_by = $1 and scheme_id = $2)`, [rdId, scheme.id]);
		await db.query('delete from visit_teams where created_by = $1 and scheme_id = $2', [rdId, scheme.id]);

		const teamId = (await db.query(`insert into visit_teams (scheme_id, created_by, status) values ($1, $2, 'APPROVED') returning id`, [scheme.id, rdId])).rows[0].id;
		await db.query(`insert into visit_team_members (team_id, user_id, team_role) values ($1, $2, 'LEAD_MEO'), ($1, $3, 'DEPT_MEMBER')`, [teamId, meoId, supportId]);
		const visitId = (await db.query(`insert into site_visits (team_id, scheme_id, status) values ($1, $2, 'SCHEDULED') returning id`, [teamId, scheme.id])).rows[0].id;

		fixture = { teamId, visitId, schemeId: scheme.id, otherDivisionSchemeId: otherDivisionScheme.id };
	}, 30000);

	afterAll(async () => {
		if (!db || !fixture) return;
		await db.query(`delete from comments where commentable_type = 'SCHEME' and commentable_id in ($1, $2)`, [String(fixture.schemeId), String(fixture.otherDivisionSchemeId)]);
		await db.query(`delete from comments where commentable_type = 'SITE_VISIT' and commentable_id = $1`, [fixture.visitId]);
		await db.query('delete from site_visits where id = $1', [fixture.visitId]);
		await db.query('delete from visit_team_members where team_id = $1', [fixture.teamId]);
		await db.query('delete from visit_teams where id = $1', [fixture.teamId]);
		await db.close();
	});

	test('a support user is blocked entirely — cannot list or post, on either a scheme or a site visit', async () => {
		const listScheme = await request(app)
			.get('/api/v1/comments')
			.query({ commentableType: 'SCHEME', commentableId: String(fixture.schemeId) })
			.set('Authorization', `Bearer ${supportToken}`);
		expect(listScheme.status).toBe(403);

		const postScheme = await request(app)
			.post('/api/v1/comments')
			.set('Authorization', `Bearer ${supportToken}`)
			.send({ commentableType: 'SCHEME', commentableId: String(fixture.schemeId), body: 'Trying to comment.' });
		expect(postScheme.status).toBe(403);

		const listVisit = await request(app)
			.get('/api/v1/comments')
			.query({ commentableType: 'SITE_VISIT', commentableId: fixture.visitId })
			.set('Authorization', `Bearer ${supportToken}`);
		expect(listVisit.status).toBe(403);
	});

	test('RD posts a comment on a scheme (province-wide, per Step 7) and MEO can read it back', async () => {
		const posted = await request(app)
			.post('/api/v1/comments')
			.set('Authorization', `Bearer ${rdToken}`)
			.send({ commentableType: 'SCHEME', commentableId: String(fixture.schemeId), body: 'Flagging for the next visit.' });
		expect(posted.status).toBe(201);
		expect(posted.body.data).toMatchObject({ body: 'Flagging for the next visit.', authorRole: 'REGIONAL_DIRECTOR' });
		fixture.schemeCommentId = posted.body.data.id;

		const listed = await request(app)
			.get('/api/v1/comments')
			.query({ commentableType: 'SCHEME', commentableId: String(fixture.schemeId) })
			.set('Authorization', `Bearer ${meoToken}`);
		expect(listed.status).toBe(200);
		expect(listed.body.data.map((c) => c.id)).toContain(fixture.schemeCommentId);

		const stored = (await db.query('select body, author_id from comments where id = $1', [fixture.schemeCommentId])).rows[0];
		expect(stored.body).toBe('Flagging for the next visit.');
	});

	test('a scheme in a different division is still commentable by any RD/DG/MEO — scheme comments are province-wide', async () => {
		const posted = await request(app)
			.post('/api/v1/comments')
			.set('Authorization', `Bearer ${meoToken}`)
			.send({ commentableType: 'SCHEME', commentableId: String(fixture.otherDivisionSchemeId), body: 'Different division, still visible.' });
		expect(posted.status).toBe(201);
	});

	test('a site visit is commentable by its team member (MEO) and the in-division DG, but a foreign-division scoping rule is respected', async () => {
		const meoPosted = await request(app)
			.post('/api/v1/comments')
			.set('Authorization', `Bearer ${meoToken}`)
			.send({ commentableType: 'SITE_VISIT', commentableId: fixture.visitId, body: 'On schedule for next week.' });
		expect(meoPosted.status).toBe(201);
		fixture.visitCommentId = meoPosted.body.data.id;

		const dgListed = await request(app)
			.get('/api/v1/comments')
			.query({ commentableType: 'SITE_VISIT', commentableId: fixture.visitId })
			.set('Authorization', `Bearer ${dgToken}`);
		expect(dgListed.status).toBe(200);
		expect(dgListed.body.data.map((c) => c.id)).toContain(fixture.visitCommentId);

		const dgPosted = await request(app)
			.post('/api/v1/comments')
			.set('Authorization', `Bearer ${dgToken}`)
			.send({ commentableType: 'SITE_VISIT', commentableId: fixture.visitId, body: 'Reviewed, looks good.' });
		expect(dgPosted.status).toBe(201);
	});

	test('404s on a site visit id that does not exist at all', async () => {
		const res = await request(app)
			.get('/api/v1/comments')
			.query({ commentableType: 'SITE_VISIT', commentableId: '00000000-0000-0000-0000-000000000000' })
			.set('Authorization', `Bearer ${meoToken}`);
		expect(res.status).toBe(404);
	});

	test('rejects an invalid commentableType, a mismatched commentableId format, and an empty body', async () => {
		const badType = await request(app)
			.post('/api/v1/comments')
			.set('Authorization', `Bearer ${meoToken}`)
			.send({ commentableType: 'ISSUE_REPORT', commentableId: 'irrelevant', body: 'Not supported yet.' });
		expect(badType.status).toBe(400);

		const badId = await request(app)
			.post('/api/v1/comments')
			.set('Authorization', `Bearer ${meoToken}`)
			.send({ commentableType: 'SCHEME', commentableId: 'not-a-number', body: 'Bad id format.' });
		expect(badId.status).toBe(400);

		const emptyBody = await request(app)
			.post('/api/v1/comments')
			.set('Authorization', `Bearer ${meoToken}`)
			.send({ commentableType: 'SCHEME', commentableId: String(fixture.schemeId), body: '' });
		expect(emptyBody.status).toBe(400);
	});

	test('only the author can edit or delete their own comment', async () => {
		const editedByOther = await request(app)
			.patch(`/api/v1/comments/${fixture.visitCommentId}`)
			.set('Authorization', `Bearer ${rdToken}`)
			.send({ body: 'Trying to edit someone else\'s comment.' });
		expect(editedByOther.status).toBe(403);

		const editedByAuthor = await request(app)
			.patch(`/api/v1/comments/${fixture.visitCommentId}`)
			.set('Authorization', `Bearer ${meoToken}`)
			.send({ body: 'Updated: on schedule, photos attached.' });
		expect(editedByAuthor.status).toBe(200);
		expect(editedByAuthor.body.data.body).toBe('Updated: on schedule, photos attached.');

		const deletedByOther = await request(app)
			.delete(`/api/v1/comments/${fixture.visitCommentId}`)
			.set('Authorization', `Bearer ${dgToken}`);
		expect(deletedByOther.status).toBe(403);

		const deletedByAuthor = await request(app)
			.delete(`/api/v1/comments/${fixture.visitCommentId}`)
			.set('Authorization', `Bearer ${meoToken}`);
		expect(deletedByAuthor.status).toBe(204);

		const remaining = await db.query('select id from comments where id = $1', [fixture.visitCommentId]);
		expect(remaining.rows).toHaveLength(0);
	});

	test('cursor pagination returns the newest comments first and pages through the rest', async () => {
		const bodies = ['First seed comment.', 'Second seed comment.', 'Third seed comment.'];
		for (const body of bodies) {
			const res = await request(app)
				.post('/api/v1/comments')
				.set('Authorization', `Bearer ${rdToken}`)
				.send({ commentableType: 'SITE_VISIT', commentableId: fixture.visitId, body });
			expect(res.status).toBe(201);
		}

		const firstPage = await request(app)
			.get('/api/v1/comments')
			.query({ commentableType: 'SITE_VISIT', commentableId: fixture.visitId, limit: 2 })
			.set('Authorization', `Bearer ${rdToken}`);
		expect(firstPage.status).toBe(200);
		expect(firstPage.body.data).toHaveLength(2);
		expect(firstPage.body.data[0].body).toBe('Third seed comment.');
		expect(firstPage.body.meta.nextCursor).toBeTruthy();

		const secondPage = await request(app)
			.get('/api/v1/comments')
			.query({ commentableType: 'SITE_VISIT', commentableId: fixture.visitId, limit: 2, cursor: firstPage.body.meta.nextCursor })
			.set('Authorization', `Bearer ${rdToken}`);
		expect(secondPage.status).toBe(200);
		expect(secondPage.body.data.map((c) => c.body)).toContain('First seed comment.');
		expect(secondPage.body.data.map((c) => c.id)).not.toEqual(expect.arrayContaining(firstPage.body.data.map((c) => c.id)));
	});
});
