const { AuditLog } = require("../models");

// Append-only activity trail. Never throws into the caller's path.
async function record({ userId, action, entityType, entityId, changes, ipAddress }) {
	try {
		await AuditLog.create({ userId, action, entityType, entityId, changes, ipAddress });
	} catch (err) {
		// eslint-disable-next-line global-require
		require("../utils/logger").error("auditService.record failed", err.message);
	}
}

module.exports = { record };
