const { Team } = require("../models");
const ApiError = require("../utils/ApiError");
const audit = require("./auditService");
const notify = require("./notificationService");
const approvalService = require("./approvalService");

async function getActiveTeam(schemeId) {
	return Team.findOne({ schemeId, status: "active" });
}

// Returns true if userId is a current (removedAt === null) member of the
// scheme's active team.
async function isActiveMember(schemeId, userId) {
	const team = await getActiveTeam(schemeId);
	if (!team) return false;
	return team.members.some(
		(m) => String(m.userId) === String(userId) && m.removedAt == null,
	);
}

function normalizeMembers(rawMembers) {
	if (!Array.isArray(rawMembers) || rawMembers.length === 0) {
		throw new ApiError(400, "A team needs at least one member");
	}
	return rawMembers.map((m) => ({
		userId: m.userId,
		roleInTeam: m.roleInTeam || "meo",
		addedAt: new Date(),
		removedAt: null,
	}));
}

// Regional Director assembles a team. Only allowed once the scheme's monitoring
// state is "approved".
async function assembleTeam({ scheme, actor, members, ipAddress }) {
	const state = await approvalService.getMonitoringState(scheme._id);
	if (state !== "approved") {
		throw new ApiError(409, `Cannot assemble a team while scheme monitoring state is "${state}"`);
	}
	if (await getActiveTeam(scheme._id)) {
		throw new ApiError(409, "An active team already exists for this scheme; disband it first");
	}

	const team = await Team.create({
		schemeId: scheme._id,
		assembledBy: actor._id,
		members: normalizeMembers(members),
		status: "active",
	});

	await audit.record({
		userId: actor._id,
		action: "team_assembled",
		entityType: "Team",
		entityId: team._id,
		changes: { members: team.members.map((m) => m.userId) },
		ipAddress,
	});
	await Promise.all(
		team.members.map((m) => notify.teamMembership({ scheme, userId: m.userId, added: true })),
	);
	return team;
}

async function addMember({ scheme, actor, userId, roleInTeam = "meo", ipAddress }) {
	const team = await getActiveTeam(scheme._id);
	if (!team) throw new ApiError(404, "No active team for this scheme");

	const existing = team.members.find((m) => String(m.userId) === String(userId));
	if (existing && existing.removedAt == null) {
		throw new ApiError(409, "User is already an active member");
	}
	if (existing) {
		// Re-activate a previously removed member as a fresh membership row.
		existing.removedAt = null;
		existing.addedAt = new Date();
		existing.roleInTeam = roleInTeam;
	} else {
		team.members.push({ userId, roleInTeam, addedAt: new Date(), removedAt: null });
	}
	await team.save();

	await audit.record({
		userId: actor._id,
		action: "team_member_added",
		entityType: "Team",
		entityId: team._id,
		changes: { userId, roleInTeam },
		ipAddress,
	});
	await notify.teamMembership({ scheme, userId, added: true });
	return team;
}

async function removeMember({ scheme, actor, userId, ipAddress }) {
	const team = await getActiveTeam(scheme._id);
	if (!team) throw new ApiError(404, "No active team for this scheme");

	const member = team.members.find(
		(m) => String(m.userId) === String(userId) && m.removedAt == null,
	);
	if (!member) throw new ApiError(404, "User is not an active member of this team");

	const activeCount = team.members.filter((m) => m.removedAt == null).length;
	if (activeCount <= 1) {
		throw new ApiError(409, "Cannot remove the last active member; disband the team instead");
	}

	member.removedAt = new Date();
	await team.save();

	await audit.record({
		userId: actor._id,
		action: "team_member_removed",
		entityType: "Team",
		entityId: team._id,
		changes: { userId },
		ipAddress,
	});
	await notify.teamMembership({ scheme, userId, added: false });
	return team;
}

// Disband the active team. Past inspections keep their teamId and stay visible
// as audit records (see MongoDB_Schema_Design.md).
async function disbandTeam({ scheme, actor, ipAddress }) {
	const team = await getActiveTeam(scheme._id);
	if (!team) throw new ApiError(404, "No active team for this scheme");
	team.status = "disbanded";
	team.members.forEach((m) => {
		if (m.removedAt == null) m.removedAt = new Date();
	});
	await team.save();
	await audit.record({
		userId: actor._id,
		action: "team_disbanded",
		entityType: "Team",
		entityId: team._id,
		ipAddress,
	});
	return team;
}

module.exports = {
	getActiveTeam,
	isActiveMember,
	assembleTeam,
	addMember,
	removeMember,
	disbandTeam,
};
