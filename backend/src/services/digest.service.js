/**
 * Automated digest reports (phases.md Step 32 — "weekly/monthly, scoped per
 * DG/RD division"), combining Step 17's notification infrastructure with
 * Step 23's analytics, per phases.md's own framing — no new data, no new UI:
 * a digest is just a notification whose body is built from the same
 * division-summary numbers AnalyticsScreen/RoleHomeScreen already show, and
 * it shows up in the existing NotificationsScreen (Step 17) like any other
 * notification. Nothing new needed on the mobile side at all.
 *
 * Like Step 25's overdue-issue escalation, this project has no cron/queue
 * infrastructure (architecture.md §6) — a real scheduled job would need a
 * deployment guarantee this app doesn't have (a single always-on instance;
 * Render's free tier can sleep, and nothing here prevents multiple
 * instances from each firing their own timer and double-sending). So
 * "automated" here means the same thing it already means for Step 25:
 * checked lazily whenever an RD/DG does something that naturally happens
 * often — loading their division dashboard — rather than introducing a new,
 * unverifiable scheduling dependency. `users.last_weekly_digest_at`/
 * `last_monthly_digest_at` (migration 0015) make each digest fire at most
 * once per real elapsed week/month, never duplicated across repeated loads.
 *
 * Business logic only — no HTTP objects, no raw SQL. Unit-testable in
 * isolation (userRepo/notificationService mocked).
 */
'use strict';

const userRepo = require('../repositories/user.repo');
const notificationService = require('./notification.service');
const { runInBackground } = require('../lib/backgroundTask');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

const DIGEST_TITLES = { weekly: 'Weekly division digest', monthly: 'Monthly division digest' };

function buildDigestBody(summary) {
	const { teams, visits, issues, overallProgress } = summary;
	const progressText = overallProgress.avgProgressPct === null
		? 'no schemes reported yet'
		: `${Math.round(overallProgress.avgProgressPct)}% average progress (${overallProgress.schemesReported} of ${overallProgress.schemesTotal} schemes reported)`;
	return `${teams.total} teams, ${visits.total} visits, ${issues.open} open issues`
		+ `${issues.bySeverity.CRITICAL > 0 ? ` (${issues.bySeverity.CRITICAL} critical)` : ''}. ${progressText}.`;
}

/**
 * `lastSentAt == null` means this column has never been set for this
 * user — rather than treating a brand-new account as instantly "overdue"
 * and firing a digest built from whatever data happens to exist at that
 * exact moment, the first-ever dashboard load just establishes a baseline
 * (the caller records "sent" without actually sending). A real digest only
 * goes out once a full period has elapsed since a real baseline.
 */
async function sendIfDue(actor, summary, period, lastSentAt, intervalMs) {
	if (!lastSentAt) {
		await userRepo.markDigestSent(actor.id, period);
		return;
	}
	if (Date.now() - new Date(lastSentAt).getTime() < intervalMs) return;

	await notificationService.notifyDigest(actor.id, {
		title: DIGEST_TITLES[period],
		body: buildDigestBody(summary),
		divisionId: actor.divisionId,
	});
	await userRepo.markDigestSent(actor.id, period);
}

/**
 * Fire-and-forget — called from dashboard.service.getDivisionSummary,
 * alongside Step 25's escalateOverdueIssues, never awaited by the HTTP
 * response. `summary` is the division summary the caller already computed
 * for this exact request, reused here rather than re-querying.
 */
function maybeSendDigests(actor, summary) {
	runInBackground(async () => {
		const timestamps = await userRepo.findDigestTimestamps(actor.id);
		if (!timestamps) return;
		await sendIfDue(actor, summary, 'weekly', timestamps.lastWeeklyDigestAt, WEEK_MS);
		await sendIfDue(actor, summary, 'monthly', timestamps.lastMonthlyDigestAt, MONTH_MS);
	}, { trigger: 'digestCheck', userId: actor.id, divisionId: actor.divisionId });
}

module.exports = { maybeSendDigests };
