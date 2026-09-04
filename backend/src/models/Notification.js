const mongoose = require("mongoose");
const { roles } = require("./common");

const schema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  recipientRole: { type: String, enum: roles },
  type: { type: String, enum: ["inspection_assigned", "deadline_upcoming", "deadline_overdue", "report_submitted", "project_delayed", "high_variance", "issue_escalated", "management_action"], required: true },
  schemeId: { type: mongoose.Schema.Types.ObjectId, ref: "Scheme" },
  title: { type: String, required: true }, message: { type: String, required: true },
  isRead: { type: Boolean, default: false }, priority: { type: String, enum: ["info", "warning", "critical"], default: "info" },
}, { timestamps: true, collection: "notifications" });

schema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
schema.index({ type: 1 });
module.exports = mongoose.models.Notification || mongoose.model("Notification", schema);
