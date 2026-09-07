const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const teamService = require("../services/teamService");

// An MEO may only create an inspection for a scheme if their userId is
// currently present in that scheme's ACTIVE team's members[] with removedAt
// null. Enforced here, not just in the UI.
// Requires req.user and req.scheme.
module.exports = asyncHandler(async (req, res, next) => {
	const team = await teamService.getActiveTeam(req.scheme._id);
	if (!team) throw new ApiError(409, "Scheme has no active monitoring team");
	const eligible = await teamService.isActiveMember(req.scheme._id, req.user._id);
	if (!eligible) {
		throw new ApiError(403, "You are not an active member of this scheme's monitoring team");
	}
	req.activeTeam = team;
	next();
});
