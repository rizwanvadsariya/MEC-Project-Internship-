/**
 * Team assembly rules: exactly one LEAD_MEO, membership eligibility, DRAFT->PENDING_APPROVAL transition, version bump on resubmit.
 * Business logic only — no HTTP objects, no raw SQL. Calls repositories/ for
 * data and other services/ for cross-cutting actions. Unit-testable in isolation.
 */
'use strict';

const teamRepo = require('../repositories/team.repo');
const userRepo = require('../repositories/user.repo');
const ApiError = require('../lib/ApiError');
const { ROLES } = require('../constants/roles');

async function assertMemberIds(ids, divisionId) {
	const uniqueIds = [...new Set(ids)];
	const profiles = await Promise.all(uniqueIds.map((id) => userRepo.findById(id)));
	if (profiles.some((profile) => !profile || !profile.is_active || profile.role !== ROLES.MEO || profile.division_id !== divisionId)) {
		throw ApiError.badRequest('All team members must be active MEOs in the RD division', undefined, 'INVALID_TEAM_MEMBER');
	}
	return uniqueIds;
}

async function createDraft(actor, input) {
	const scheme = await teamRepo.findSchemeDivision(input.schemeId);
	if (!scheme) throw ApiError.notFound('Scheme not found');
	if (scheme.divisionId !== actor.divisionId) {
		throw ApiError.forbidden('You can only assemble teams for schemes in your division', 'TEAM_DIVISION_DENIED');
	}
	const memberIds = await assertMemberIds([input.leadMeoId, ...input.supportingMemberIds], actor.divisionId);
	return teamRepo.createDraft({ ...input, createdBy: actor.id, supportingMemberIds: memberIds.filter((id) => id !== input.leadMeoId) });
}

async function eligibleMembers(actor) {
	return teamRepo.findEligibleMembers(actor.divisionId);
}

async function submit(actor, teamId) {
	const team = await teamRepo.getById(teamId);
	if (!team || team.createdBy !== actor.id) throw ApiError.notFound('Team not found');
	if (!team.members.some((member) => member.teamRole === 'LEAD_MEO')) throw ApiError.badRequest('A lead MEO is required before submission', undefined, 'LEAD_MEO_REQUIRED');
	return teamRepo.submit(teamId, actor.id);
}

async function resubmit(actor, teamId) {
	const team = await teamRepo.getById(teamId);
	if (!team || team.createdBy !== actor.id) throw ApiError.notFound('Team not found');
	if (team.status !== 'REJECTED') throw ApiError.conflict('Only rejected teams can be resubmitted', undefined, 'TEAM_NOT_REJECTED');
	return teamRepo.resubmit(teamId, actor.id);
}

module.exports = { createDraft, eligibleMembers, submit, resubmit };
