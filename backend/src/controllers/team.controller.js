const { ok, created } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");
const teamService = require("../services/teamService");

// POST /schemes/:schemeId/team  (regional_director) - assemble
const assemble = asyncHandler(async (req, res) => {
	const team = await teamService.assembleTeam({
		scheme: req.scheme,
		actor: req.user,
		members: req.validated.members,
		ipAddress: req.ip,
	});
	return created(res, team);
});

const get = asyncHandler(async (req, res) => {
	const team = await teamService.getActiveTeam(req.scheme._id);
	return ok(res, team);
});

const addMember = asyncHandler(async (req, res) => {
	const team = await teamService.addMember({
		scheme: req.scheme,
		actor: req.user,
		userId: req.body.userId,
		roleInTeam: req.body.roleInTeam,
		ipAddress: req.ip,
	});
	return ok(res, team);
});

const removeMember = asyncHandler(async (req, res) => {
	const team = await teamService.removeMember({
		scheme: req.scheme,
		actor: req.user,
		userId: req.params.userId,
		ipAddress: req.ip,
	});
	return ok(res, team);
});

const disband = asyncHandler(async (req, res) => {
	const team = await teamService.disbandTeam({ scheme: req.scheme, actor: req.user, ipAddress: req.ip });
	return ok(res, team);
});

module.exports = { assemble, get, addMember, removeMember, disband };
