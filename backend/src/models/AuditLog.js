const mongoose = require("mongoose");
const schema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, action: { type: String, required: true },
	entityType: { type: String, required: true }, entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
	changes: mongoose.Schema.Types.Mixed, ipAddress: String, timestamp: { type: Date, default: Date.now, required: true },
}, { collection: "auditLogs", versionKey: false });
schema.index({ entityType: 1, entityId: 1 }); schema.index({ userId: 1 }); schema.index({ timestamp: -1 });
module.exports = mongoose.models.AuditLog || mongoose.model("AuditLog", schema);
