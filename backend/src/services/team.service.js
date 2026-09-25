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

/**
 * The lead slot must be an MEO (the one who actually does the fieldwork).
 * Supporting slots accept either another MEO or a SUPPORT_USER — schema.md's
 * team_member_role enum has both SUPPORT_MEO and DEPT_MEMBER for exactly this
 * ("supporting MEOs, other-department staff who accompany the lead MEO" per
 * PRD.md's role table) — team.repo.createDraft assigns whichever matches the
 * member's actual app role.
 */
async function assertMember(id, divisionId, allowedRoles) {
	const profile = await userRepo.findById(id);
	// A SUPPORT_USER may have a NULL division_id (schema.md §4.1's CHECK
	// constraint explicitly allows this) — that makes them division-agnostic,
	// not out-of-division, so they pass the division check either way. An MEO
	// always needs an exact division match.
	const inDivision = !!profile && (profile.division_id === divisionId || (profile.role === ROLES.SUPPORT_USER && profile.division_id === null));
	if (!profile || !profile.is_active || !inDivision || !allowedRoles.includes(profile.role)) {
		throw ApiError.badRequest('All team members must be active MEOs or support users in the RD division', undefined, 'INVALID_TEAM_MEMBER');
	}
	return profile;
}

async function createDraft(actor, input) {
	const scheme = await teamRepo.findSchemeDivision(input.schemeId);
	if (!scheme) throw ApiError.notFound('Scheme not found');
	if (scheme.divisionId !== actor.divisionId) {
		throw ApiError.forbidden('You can only assemble teams for schemes in your division', 'TEAM_DIVISION_DENIED');
	}
	await assertMember(input.leadMeoId, actor.divisionId, [ROLES.MEO]);
	const uniqueSupportingIds = [...new Set(input.supportingMemberIds)].filter((id) => id !== input.leadMeoId);
	const supportingProfiles = await Promise.all(
		uniqueSupportingIds.map((id) => assertMember(id, actor.divisionId, [ROLES.MEO, ROLES.SUPPORT_USER])),
	);
	const supportingMembers = supportingProfiles.map((profile) => ({
		id: profile.id,
		teamRole: profile.role === ROLES.MEO ? 'SUPPORT_MEO' : 'DEPT_MEMBER',
	}));
	return teamRepo.createDraft({ schemeId: input.schemeId, createdBy: actor.id, leadMeoId: input.leadMeoId, supportingMembers });
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
