const { AuditLog } = require("../models");
const { ok } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

// GET /audit-logs?entityType=&entityId=&userId=&action=&page=&limit=
const list = asyncHandler(async (req, res) => {
	const { entityType, entityId, userId, action, page = 1, limit = 50 } = req.query;
	const q = {};
	if (entityType) q.entityType = entityType;
	if (entityId) q.entityId = entityId;
	if (userId) q.userId = userId;
	if (action) q.action = action;
	const items = await AuditLog.find(q)
		.sort({ timestamp: -1 })
		.skip((Number(page) - 1) * Number(limit))
		.limit(Number(limit))
		.populate("userId", "name role");
	const total = await AuditLog.countDocuments(q);
	return ok(res, { total, page: Number(page), limit: Number(limit), items });
});

module.exports = { list };
