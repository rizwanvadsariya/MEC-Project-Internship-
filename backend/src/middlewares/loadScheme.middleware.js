const { Scheme } = require("../models");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

// Resolves :schemeId (ObjectId or ADP uid) and attaches req.scheme.
module.exports = asyncHandler(async (req, res, next) => {
	const key = req.params.schemeId || req.params.id;
	const query = /^[0-9a-fA-F]{24}$/.test(key) ? { _id: key } : { uid: key };
	const scheme = await Scheme.findOne(query);
	if (!scheme) throw new ApiError(404, "Scheme not found");
	req.scheme = scheme;
	next();
});
