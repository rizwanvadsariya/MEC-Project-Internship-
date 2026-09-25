/** Unit: exactly-one-LEAD_MEO rule, DRAFT->PENDING transition, version bump on
 *  resubmit — no HTTP, no DB (repositories mocked). */
'use strict';

jest.mock('../../../src/repositories/team.repo', () => ({
	findSchemeDivision: jest.fn(),
	findEligibleMembers: jest.fn(),
	createDraft: jest.fn(),
	getById: jest.fn(),
	submit: jest.fn(),
	resubmit: jest.fn(),
}));
jest.mock('../../../src/repositories/user.repo', () => ({
	findById: jest.fn(),
}));

const teamRepo = require('../../../src/repositories/team.repo');
const userRepo = require('../../../src/repositories/user.repo');
const teamService = require('../../../src/services/team.service');

const actor = { id: 'rd-1', role: 'REGIONAL_DIRECTOR', divisionId: 1 };
const profile = (overrides) => ({ id: 'user-1', is_active: true, division_id: 1, role: 'MEO', ...overrides });

beforeEach(() => {
	jest.clearAllMocks();
	teamRepo.findSchemeDivision.mockResolvedValue({ divisionId: 1 });
	teamRepo.createDraft.mockResolvedValue({ id: 'team-1' });
});

test('a supporting MEO is recorded as SUPPORT_MEO and a supporting support-user as DEPT_MEMBER', async () => {
	userRepo.findById.mockImplementation((id) => Promise.resolve({
		'lead-1': profile({ id: 'lead-1', role: 'MEO' }),
		'meo-2': profile({ id: 'meo-2', role: 'MEO' }),
		'support-1': profile({ id: 'support-1', role: 'SUPPORT_USER' }),
	}[id]));

	await teamService.createDraft(actor, { schemeId: 5, leadMeoId: 'lead-1', supportingMemberIds: ['meo-2', 'support-1'] });

	expect(teamRepo.createDraft).toHaveBeenCalledWith({
		schemeId: 5,
		createdBy: actor.id,
		leadMeoId: 'lead-1',
		supportingMembers: expect.arrayContaining([
			{ id: 'meo-2', teamRole: 'SUPPORT_MEO' },
			{ id: 'support-1', teamRole: 'DEPT_MEMBER' },
		]),
	});
});

test('rejects a lead MEO slot filled by a SUPPORT_USER', async () => {
	userRepo.findById.mockResolvedValue(profile({ id: 'support-1', role: 'SUPPORT_USER' }));
	await expect(teamService.createDraft(actor, { schemeId: 5, leadMeoId: 'support-1', supportingMemberIds: [] }))
		.rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TEAM_MEMBER' });
	expect(teamRepo.createDraft).not.toHaveBeenCalled();
});

test('rejects an inactive or out-of-division supporting member', async () => {
	userRepo.findById.mockImplementation((id) => Promise.resolve({
		'lead-1': profile({ id: 'lead-1' }),
		'inactive-1': profile({ id: 'inactive-1', is_active: false }),
	}[id]));
	await expect(teamService.createDraft(actor, { schemeId: 5, leadMeoId: 'lead-1', supportingMemberIds: ['inactive-1'] }))
		.rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TEAM_MEMBER' });

	userRepo.findById.mockImplementation((id) => Promise.resolve({
		'lead-1': profile({ id: 'lead-1' }),
		'other-division-1': profile({ id: 'other-division-1', division_id: 2 }),
	}[id]));
	await expect(teamService.createDraft(actor, { schemeId: 5, leadMeoId: 'lead-1', supportingMemberIds: ['other-division-1'] }))
		.rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TEAM_MEMBER' });

	// A SUPPORT_USER genuinely assigned to a DIFFERENT division is still out of bounds —
	// only a NULL division_id (division-agnostic) gets the pass, not any mismatch.
	userRepo.findById.mockImplementation((id) => Promise.resolve({
		'lead-1': profile({ id: 'lead-1' }),
		'support-other-division': profile({ id: 'support-other-division', role: 'SUPPORT_USER', division_id: 2 }),
	}[id]));
	await expect(teamService.createDraft(actor, { schemeId: 5, leadMeoId: 'lead-1', supportingMemberIds: ['support-other-division'] }))
		.rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TEAM_MEMBER' });
});

test('accepts a division-agnostic support user (NULL division_id) as a supporting member', async () => {
	userRepo.findById.mockImplementation((id) => Promise.resolve({
		'lead-1': profile({ id: 'lead-1' }),
		'support-1': profile({ id: 'support-1', role: 'SUPPORT_USER', division_id: null }),
	}[id]));
	await teamService.createDraft(actor, { schemeId: 5, leadMeoId: 'lead-1', supportingMemberIds: ['support-1'] });
	expect(teamRepo.createDraft).toHaveBeenCalledWith(expect.objectContaining({
		supportingMembers: [{ id: 'support-1', teamRole: 'DEPT_MEMBER' }],
	}));
});

test('rejects a supporting member who is an RD/DG (neither MEO nor SUPPORT_USER)', async () => {
	userRepo.findById.mockImplementation((id) => Promise.resolve({
		'lead-1': profile({ id: 'lead-1' }),
		'dg-1': profile({ id: 'dg-1', role: 'DIRECTOR_GENERAL' }),
	}[id]));
	await expect(teamService.createDraft(actor, { schemeId: 5, leadMeoId: 'lead-1', supportingMemberIds: ['dg-1'] }))
		.rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TEAM_MEMBER' });
});

test('rejects assembling a team for a scheme outside the RD division', async () => {
	teamRepo.findSchemeDivision.mockResolvedValue({ divisionId: 2 });
	await expect(teamService.createDraft(actor, { schemeId: 5, leadMeoId: 'lead-1', supportingMemberIds: [] }))
		.rejects.toMatchObject({ statusCode: 403, code: 'TEAM_DIVISION_DENIED' });
});

test.todo('submitting a DRAFT team transitions it to PENDING_APPROVAL');
test.todo('resubmitting a REJECTED team bumps visit_teams.version');
