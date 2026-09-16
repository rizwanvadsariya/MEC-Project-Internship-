/** Unit: cursor encode/decode and not-found handling in siteVisit.service.
 *  Mocks siteVisit.repo (factory form — never loads the real module, which
 *  requires src/config/database and is fatal at require-time with no
 *  backend/.env) so this needs no DB and runs in CI. The scoping SQL itself
 *  (siteVisit.repo.listForActor/findByIdForActor) is covered against the real
 *  DB by tests/integration/routes/siteVisits.routes.test.js. */
'use strict';

jest.mock('../../../src/repositories/siteVisit.repo', () => ({
	listForActor: jest.fn(),
	findByIdForActor: jest.fn(),
}));

const siteVisitRepo = require('../../../src/repositories/siteVisit.repo');
const siteVisitService = require('../../../src/services/siteVisit.service');

const actor = { id: 'meo-1', role: 'MEO', divisionId: 1 };

afterEach(() => jest.clearAllMocks());

test('list passes filters through to the repo, with no cursor when none was given', async () => {
	siteVisitRepo.listForActor.mockResolvedValue({ rows: [], nextCursor: null });

	await siteVisitService.list(actor, { status: 'SCHEDULED', limit: 20 });

	expect(siteVisitRepo.listForActor).toHaveBeenCalledWith(actor, { status: 'SCHEDULED', limit: 20, cursor: undefined });
});

test('list decodes an opaque "<createdAt>_<id>" cursor into { createdAt, id } for the repo\'s keyset query', async () => {
	siteVisitRepo.listForActor.mockResolvedValue({ rows: [], nextCursor: null });

	await siteVisitService.list(actor, { limit: 20, cursor: '2026-09-16T10:00:00.000Z_11111111-1111-1111-1111-111111111111' });

	expect(siteVisitRepo.listForActor).toHaveBeenCalledWith(actor, {
		limit: 20,
		cursor: { createdAt: '2026-09-16T10:00:00.000Z', id: '11111111-1111-1111-1111-111111111111' },
	});
});

test('list rejects a malformed cursor (no "_" separator) as a 400 rather than passing garbage to SQL', async () => {
	await expect(siteVisitService.list(actor, { limit: 20, cursor: 'not-a-cursor' })).rejects.toMatchObject({ statusCode: 400 });
});

test('getById returns the repo row when the actor can see it', async () => {
	const visit = { id: 'visit-1', status: 'SCHEDULED' };
	siteVisitRepo.findByIdForActor.mockResolvedValue(visit);

	await expect(siteVisitService.getById(actor, 'visit-1')).resolves.toBe(visit);
});

test('getById throws 404 when the repo returns null — visit does not exist, or exists but the actor cannot see it (division/membership scoping is inside the repo query)', async () => {
	siteVisitRepo.findByIdForActor.mockResolvedValue(null);

	await expect(siteVisitService.getById(actor, 'other-division-visit')).rejects.toMatchObject({ statusCode: 404 });
});
