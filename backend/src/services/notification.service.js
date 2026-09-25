/**
 * Build notification rows and hand push fan-out to the background job queue (never inline).
 * Business logic only — no HTTP objects, no raw SQL. Calls repositories/ for
 * data and other services/ for cross-cutting actions. Unit-testable in isolation.
 */
'use strict';

const notificationRepo = require('../repositories/notification.repo');
const pushTokenRepo = require('../repositories/pushToken.repo');
const teamRepo = require('../repositories/team.repo');
const issueRepo = require('../repositories/issue.repo');
const { sendPushNotifications } = require('../lib/pushSender');
const { runInBackground } = require('../lib/backgroundTask');
const ApiError = require('../lib/ApiError');

// Expo's own format, e.g. "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]".
const EXPO_PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^[\]]+\]$/;

function decodeCursor(cursor) {
	if (!cursor) return undefined;
	const separatorIndex = cursor.lastIndexOf('_');
	if (separatorIndex === -1) throw ApiError.badRequest('Invalid cursor');
	return { createdAt: cursor.slice(0, separatorIndex), id: cursor.slice(separatorIndex + 1) };
}

async function registerPushToken(actor, token, platform) {
	if (!EXPO_PUSH_TOKEN_PATTERN.test(token)) throw ApiError.badRequest('Not a valid Expo push token');
	return pushTokenRepo.upsert(actor.id, token, platform);
}

async function removePushToken(actor, token) {
	await pushTokenRepo.removeForUser(actor.id, token);
}

async function list(actor, query) {
	const { cursor, ...rest } = query;
	return notificationRepo.listForUser(actor.id, { ...rest, cursor: decodeCursor(cursor) });
}

async function markRead(actor, id) {
	const notification = await notificationRepo.markRead(actor.id, id);
	if (!notification) throw ApiError.notFound('Notification not found');
	return notification;
}

/**
 * Writes notification rows + fans out push for a set of recipients. Always
 * called from inside a runInBackground body (never awaited by an HTTP
 * response), so a slow or failed push send never delays or breaks the
 * request that triggered it.
 */
async function dispatch(recipientUserIds, { title, body, relatedType, relatedId }) {
	const uniqueRecipients = [...new Set(recipientUserIds)].filter(Boolean);
	if (!uniqueRecipients.length) return;

	await notificationRepo.create(uniqueRecipients.map((userId) => ({ userId, title, body, relatedType, relatedId })));

	const tokens = await pushTokenRepo.findTokensForUsers(uniqueRecipients);
	if (!tokens.length) return;

	const { invalidTokens } = await sendPushNotifications(
		tokens.map(({ token }) => ({ to: token, title, body, data: { relatedType, relatedId } })),
	);
	if (invalidTokens.length) await Promise.all(invalidTokens.map((token) => pushTokenRepo.removeToken(token)));
}

/**
 * Trigger: team approved/rejected. Notifies the RD who submitted it always;
 * once APPROVED, every other team member too, since their assignment just
 * became real (a site visit now exists for them to act on).
 */
function notifyTeamDecision(teamId, decision) {
	runInBackground(async () => {
		const team = await teamRepo.getById(teamId);
		if (!team) return;
		const scheme = await notificationRepo.findSchemeBasics(team.schemeId);
		const schemeName = scheme?.name ?? 'your scheme';
		const recipients = decision === 'APPROVED'
			? [team.createdBy, ...team.members.map((member) => member.userId)]
			: [team.createdBy];

		await dispatch(recipients, {
			title: decision === 'APPROVED' ? 'Team approved' : 'Team rejected',
			body: decision === 'APPROVED'
				? `Your monitoring team for ${schemeName} was approved. A site visit has been scheduled.`
				: `Your monitoring team for ${schemeName} was rejected. Revise and resubmit.`,
			relatedType: 'TEAM',
			relatedId: teamId,
		});
	}, { trigger: 'teamDecision', teamId, decision });
}

/**
 * Trigger: issue filed. An issue filed while its report is still DRAFT is
 * the lead MEO's own invisible working copy (Step 15's rule) — so this is
 * never called at file() time. It only runs from notifyVisitCompleted below,
 * once the whole report (form + photos + issues) is actually SUBMITTED and
 * genuinely visible to the rest of the team. Notifies the rest of the team
 * (not the filer) plus the scheme's own division's RD/DG, for oversight.
 */
async function notifyIssueFiled(issue, context) {
	const recipients = [
		...context.teamMemberIds.filter((userId) => userId !== issue.reportedBy),
		...context.divisionLeadershipIds,
	];
	await dispatch(recipients, {
		title: `${issue.severity} issue reported`,
		body: `${issue.issueType} — ${context.schemeName}`,
		relatedType: 'ISSUE_REPORT',
		relatedId: issue.id,
	});
}

/**
 * Trigger: visit completed — tied to the lead MEO submitting the visit form,
 * the app's existing "this report is done" signal (there is no separate
 * "complete visit" action anywhere else in the app; visitForm.service sets
 * site_visits.status to COMPLETED in the same transaction as the submit).
 * Notifies the team's RD and the scheme's division DG/RD, and — since any
 * issues filed against this visit only become visible to the rest of the
 * team at this exact moment — also fires the "issue filed" notification for
 * each of them here, not earlier.
 */
function notifyVisitCompleted(siteVisitId) {
	runInBackground(async () => {
		const context = await notificationRepo.findVisitNotificationContext(siteVisitId);
		if (!context) return;

		await dispatch([context.createdBy, ...context.divisionLeadershipIds], {
			title: 'Site visit completed',
			body: `The field report for ${context.schemeName} has been submitted.`,
			relatedType: 'SITE_VISIT',
			relatedId: siteVisitId,
		});

		const issues = await issueRepo.list(siteVisitId);
		for (const issue of issues) {
			await notifyIssueFiled(issue, context);
		}
	}, { trigger: 'visitCompleted', siteVisitId });
}

module.exports = {
	registerPushToken,
	removePushToken,
	list,
	markRead,
	notifyTeamDecision,
	notifyIssueFiled,
	notifyVisitCompleted,
};
