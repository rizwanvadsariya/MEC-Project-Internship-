'use strict';

jest.mock('../../../src/repositories/comment.repo', () => ({
	listForCommentable: jest.fn(),
	create: jest.fn(),
	findById: jest.fn(),
	update: jest.fn(),
	remove: jest.fn(),
}));
jest.mock('../../../src/repositories/scheme.repo', () => ({ findById: jest.fn() }));
jest.mock('../../../src/repositories/siteVisit.repo', () => ({ findByIdForActor: jest.fn() }));

const commentRepo = require('../../../src/repositories/comment.repo');
const schemeRepo = require('../../../src/repositories/scheme.repo');
const siteVisitRepo = require('../../../src/repositories/siteVisit.repo');
const commentService = require('../../../src/services/comment.service');

const actor = { id: 'rd-1', role: 'REGIONAL_DIRECTOR', fullName: 'Test RD', divisionId: 1 };
const comment = {
	id: 'comment-1',
	commentableType: 'SCHEME',
	commentableId: '42',
	authorId: 'rd-1',
	body: 'Worth a follow-up visit.',
	createdAt: new Date('2026-01-01T00:00:00.000Z'),
	updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

beforeEach(() => {
	jest.clearAllMocks();
	schemeRepo.findById.mockResolvedValue({ id: 42 });
	siteVisitRepo.findByIdForActor.mockResolvedValue({ id: 'visit-1' });
	commentRepo.listForCommentable.mockResolvedValue({ rows: [comment], nextCursor: null });
	commentRepo.create.mockResolvedValue(comment);
	commentRepo.findById.mockResolvedValue(comment);
	commentRepo.update.mockResolvedValue({ ...comment, body: 'Edited.' });
});

test('lists comments on a scheme after confirming the scheme exists', async () => {
	await expect(commentService.list(actor, { commentableType: 'SCHEME', commentableId: '42', limit: 20 }))
		.resolves.toEqual({ rows: [comment], nextCursor: null });
	expect(schemeRepo.findById).toHaveBeenCalledWith('42');
	expect(commentRepo.listForCommentable).toHaveBeenCalledWith('SCHEME', '42', { cursor: undefined, limit: 20 });
});

test('404s listing comments on a scheme that does not exist', async () => {
	schemeRepo.findById.mockResolvedValue(null);
	await expect(commentService.list(actor, { commentableType: 'SCHEME', commentableId: '999', limit: 20 }))
		.rejects.toMatchObject({ statusCode: 404 });
	expect(commentRepo.listForCommentable).not.toHaveBeenCalled();
});

test('404s listing comments on a site visit the actor cannot see (division/membership scope)', async () => {
	siteVisitRepo.findByIdForActor.mockResolvedValue(null);
	await expect(commentService.list(actor, { commentableType: 'SITE_VISIT', commentableId: 'visit-1', limit: 20 }))
		.rejects.toMatchObject({ statusCode: 404 });
	expect(commentRepo.listForCommentable).not.toHaveBeenCalled();
});

test('decodes a createdAt_id cursor before handing it to the repo', async () => {
	await commentService.list(actor, { commentableType: 'SCHEME', commentableId: '42', cursor: '2026-01-01T00:00:00.000Z_comment-9', limit: 20 });
	expect(commentRepo.listForCommentable).toHaveBeenCalledWith('SCHEME', '42', {
		cursor: { createdAt: '2026-01-01T00:00:00.000Z', id: 'comment-9' },
		limit: 20,
	});
});

test('rejects a malformed cursor', async () => {
	await expect(commentService.list(actor, { commentableType: 'SCHEME', commentableId: '42', cursor: 'not-a-cursor', limit: 20 }))
		.rejects.toMatchObject({ statusCode: 400 });
});

test('creates a comment on a visible scheme, stamping the author name/role from the actor', async () => {
	await expect(commentService.create(actor, { commentableType: 'SCHEME', commentableId: '42', body: 'Worth a follow-up visit.' }))
		.resolves.toEqual({ ...comment, authorName: 'Test RD', authorRole: 'REGIONAL_DIRECTOR' });
	expect(commentRepo.create).toHaveBeenCalledWith('SCHEME', '42', 'rd-1', 'Worth a follow-up visit.');
});

test('creates a comment on a site visit only after confirming the actor can view it', async () => {
	await commentService.create(actor, { commentableType: 'SITE_VISIT', commentableId: 'visit-1', body: 'On track.' });
	expect(siteVisitRepo.findByIdForActor).toHaveBeenCalledWith(actor, 'visit-1');
	expect(commentRepo.create).toHaveBeenCalledWith('SITE_VISIT', 'visit-1', 'rd-1', 'On track.');
});

test('404s creating a comment on a site visit the actor cannot see', async () => {
	siteVisitRepo.findByIdForActor.mockResolvedValue(null);
	await expect(commentService.create(actor, { commentableType: 'SITE_VISIT', commentableId: 'visit-1', body: 'On track.' }))
		.rejects.toMatchObject({ statusCode: 404 });
	expect(commentRepo.create).not.toHaveBeenCalled();
});

test('the author can edit their own comment', async () => {
	await expect(commentService.update(actor, 'comment-1', 'Edited.'))
		.resolves.toEqual({ ...comment, body: 'Edited.', authorName: 'Test RD', authorRole: 'REGIONAL_DIRECTOR' });
	expect(commentRepo.update).toHaveBeenCalledWith('comment-1', 'Edited.');
});

test('rejects editing someone else\'s comment', async () => {
	commentRepo.findById.mockResolvedValue({ ...comment, authorId: 'someone-else' });
	await expect(commentService.update(actor, 'comment-1', 'Edited.')).rejects.toMatchObject({ statusCode: 403 });
	expect(commentRepo.update).not.toHaveBeenCalled();
});

test('404s editing a comment that does not exist', async () => {
	commentRepo.findById.mockResolvedValue(null);
	await expect(commentService.update(actor, 'missing', 'Edited.')).rejects.toMatchObject({ statusCode: 404 });
});

test('the author can delete their own comment', async () => {
	await commentService.remove(actor, 'comment-1');
	expect(commentRepo.remove).toHaveBeenCalledWith('comment-1');
});

test('rejects deleting someone else\'s comment', async () => {
	commentRepo.findById.mockResolvedValue({ ...comment, authorId: 'someone-else' });
	await expect(commentService.remove(actor, 'comment-1')).rejects.toMatchObject({ statusCode: 403 });
	expect(commentRepo.remove).not.toHaveBeenCalled();
});

test('404s deleting a comment that does not exist', async () => {
	commentRepo.findById.mockResolvedValue(null);
	await expect(commentService.remove(actor, 'missing')).rejects.toMatchObject({ statusCode: 404 });
});
