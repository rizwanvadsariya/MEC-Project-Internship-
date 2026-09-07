const mongoose = require("mongoose");
const { roles } = require("./common");

const notificationTypes = [
	"monitoring_submitted",
	"monitoring_approved",
	"monitoring_rejected",
	"team_member_added",
	"team_member_removed",
	"report_submitted",
	"project_delayed",
	"high_variance",
	"issue_escalated",
];

const schema = new mongoose.Schema({
	recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // nullable for role-broadcast
	recipientRole: { type: String, enum: roles },
	type: { type: String, enum: notificationTypes, required: true },
	schemeId: { type: mongoose.Schema.Types.ObjectId, ref: "Scheme" },
	title: { type: String, required: true }, message: { type: String, required: true },
	isRead: { type: Boolean, default: false }, priority: { type: String, enum: ["info", "warning", "critical"], default: "info" },
}, { timestamps: true, collection: "notifications" });

schema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
schema.index({ type: 1 });

module.exports = mongoose.models.Notification || mongoose.model("Notification", schema);
module.exports.notificationTypes = notificationTypes;
