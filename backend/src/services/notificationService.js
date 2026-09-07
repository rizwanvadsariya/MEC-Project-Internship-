const { Notification, User } = require("../models");

// Central place every meaningful workflow trigger calls to raise notifications.
// Each helper is best-effort and must not break the caller's transaction path.

async function notifyUser({ recipientId, type, schemeId, title, message, priority = "info" }) {
	return Notification.create({ recipientId, type, schemeId, title, message, priority });
}

async function notifyRole({ recipientRole, type, schemeId, title, message, priority = "info" }) {
	return Notification.create({ recipientRole, type, schemeId, title, message, priority });
}

// -- Workflow-specific triggers --------------------------------------------

async function schemeSubmittedForMonitoring({ scheme }) {
	return notifyRole({
		recipientRole: "director_general",
		type: "monitoring_submitted",
		schemeId: scheme._id,
		title: "Scheme submitted for monitoring approval",
		message: `Scheme ${scheme.uid} awaits Director General review.`,
		priority: "warning",
	});
}

async function monitoringDecision({ scheme, approval }) {
	const approved = approval.status === "approved";
	return notifyUser({
		recipientId: approval.submittedBy,
		type: approved ? "monitoring_approved" : "monitoring_rejected",
		schemeId: scheme._id,
		title: approved ? "Monitoring approved" : "Monitoring rejected",
		message: approved
			? `Scheme ${scheme.uid} was approved for monitoring. You may now assemble a team.`
			: `Scheme ${scheme.uid} was rejected: ${approval.rejectionReason}`,
		priority: approved ? "info" : "warning",
	});
}

async function teamMembership({ scheme, userId, added }) {
	return notifyUser({
		recipientId: userId,
		type: added ? "team_member_added" : "team_member_removed",
		schemeId: scheme._id,
		title: added ? "Added to a monitoring team" : "Removed from a monitoring team",
		message: `You were ${added ? "added to" : "removed from"} the monitoring team for scheme ${scheme.uid}.`,
	});
}

async function redFlagVariance({ scheme, varianceRecord }) {
	const out = [];
	out.push(
		notifyRole({
			recipientRole: "pd_mec_central",
			type: "high_variance",
			schemeId: scheme._id,
			title: "Red-flag variance",
			message: `Scheme ${scheme.uid} variance index ${varianceRecord.varianceIndex.toFixed(1)}% (red).`,
			priority: "critical",
		}),
	);
	// Relevant line department head(s).
	const heads = await User.find({
		role: "line_department_head",
		departmentId: scheme.departmentId,
	}).select("_id");
	for (const head of heads) {
		out.push(
			notifyUser({
				recipientId: head._id,
				type: "high_variance",
				schemeId: scheme._id,
				title: "Red-flag variance in your department",
				message: `Scheme ${scheme.uid} variance index ${varianceRecord.varianceIndex.toFixed(1)}% (red).`,
				priority: "critical",
			}),
		);
	}
	return Promise.all(out);
}

module.exports = {
	notifyUser,
	notifyRole,
	schemeSubmittedForMonitoring,
	monitoringDecision,
	teamMembership,
	redFlagVariance,
};
