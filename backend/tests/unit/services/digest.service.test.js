/** Unit: digest.service's lazy weekly/monthly digest check (phases.md Step
 *  32). Mocks user.repo + notification.service + backgroundTask, so the real
 *  modules — which need backend/.env — are never loaded. `runInBackground`
 *  is mocked to invoke its function immediately and return the promise, so
 *  `flush()` can await maybeSendDigests' background work deterministically,
 *  the exact same pattern notification.service.test.js already established
 *  for its own runInBackground-wrapped triggers. */
'use strict';

jest.mock('../../../src/repositories/user.repo', () => ({
	findDigestTimestamps: jest.fn(),
	markDigestSent: jest.fn(),
}));
jest.mock('../../../src/services/notification.service', () => ({ notifyDigest: jest.fn() }));
jest.mock('../../../src/lib/backgroundTask', () => ({ runInBackground: jest.fn((fn) => fn()) }));

const userRepo = require('../../../src/repositories/user.repo');
const notificationService = require('../../../src/services/notification.service');
const { runInBackground } = require('../../../src/lib/backgroundTask');
const digestService = require('../../../src/services/digest.service');

async function flush() {
	const last = runInBackground.mock.results[runInBackground.mock.results.length - 1];
	await last.value;
}

const actor = { id: 'rd-1', divisionId: 1 };

const summary = {
	teams: { total: 5 },
	visits: { total: 8 },
	issues: { open: 3, bySeverity: { CRITICAL: 1, HIGH: 1, MEDIUM: 1, LOW: 0 } },
	overallProgress: { avgProgressPct: 42.4, schemesReported: 9, schemesTotal: 20 },
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

beforeEach(() => {
	jest.clearAllMocks();
	userRepo.markDigestSent.mockResolvedValue();
	notificationService.notifyDigest.mockResolvedValue();
});

describe('maybeSendDigests', () => {
	test('a user who has never had either digest column set gets a baseline recorded for both, with no notification sent', async () => {
		userRepo.findDigestTimestamps.mockResolvedValue({ lastWeeklyDigestAt: null, lastMonthlyDigestAt: null });

		digestService.maybeSendDigests(actor, summary);
		await flush();

		expect(userRepo.markDigestSent).toHaveBeenCalledWith('rd-1', 'weekly');
		expect(userRepo.markDigestSent).toHaveBeenCalledWith('rd-1', 'monthly');
		expect(notificationService.notifyDigest).not.toHaveBeenCalled();
	});

	test('neither digest fires when less than a week/month has elapsed since the last one', async () => {
		const now = Date.now();
		userRepo.findDigestTimestamps.mockResolvedValue({
			lastWeeklyDigestAt: new Date(now - (WEEK_MS - 60_000)).toISOString(),
			lastMonthlyDigestAt: new Date(now - (MONTH_MS - 60_000)).toISOString(),
		});

		digestService.maybeSendDigests(actor, summary);
		await flush();

		expect(notificationService.notifyDigest).not.toHaveBeenCalled();
		expect(userRepo.markDigestSent).not.toHaveBeenCalled();
	});

	test('the weekly digest fires once a full week has elapsed, with a body built from the real summary numbers', async () => {
		const now = Date.now();
		userRepo.findDigestTimestamps.mockResolvedValue({
			lastWeeklyDigestAt: new Date(now - (WEEK_MS + 60_000)).toISOString(),
			lastMonthlyDigestAt: new Date(now - 60_000).toISOString(), // just sent, not due
		});

		digestService.maybeSendDigests(actor, summary);
		await flush();

		expect(notificationService.notifyDigest).toHaveBeenCalledTimes(1);
		const [userId, payload] = notificationService.notifyDigest.mock.calls[0];
		expect(userId).toBe('rd-1');
		expect(payload.title).toBe('Weekly division digest');
		expect(payload.divisionId).toBe(1);
		expect(payload.body).toContain('5 teams');
		expect(payload.body).toContain('8 visits');
		expect(payload.body).toContain('3 open issues');
		expect(payload.body).toContain('1 critical');
		expect(payload.body).toContain('42% average progress');
		expect(payload.body).toContain('9 of 20 schemes reported');

		expect(userRepo.markDigestSent).toHaveBeenCalledWith('rd-1', 'weekly');
		expect(userRepo.markDigestSent).not.toHaveBeenCalledWith('rd-1', 'monthly');
	});

	test('the monthly digest fires once a full month has elapsed, independently of the weekly one', async () => {
		const now = Date.now();
		userRepo.findDigestTimestamps.mockResolvedValue({
			lastWeeklyDigestAt: new Date(now - 60_000).toISOString(), // just sent, not due
			lastMonthlyDigestAt: new Date(now - (MONTH_MS + 60_000)).toISOString(),
		});

		digestService.maybeSendDigests(actor, summary);
		await flush();

		expect(notificationService.notifyDigest).toHaveBeenCalledTimes(1);
		expect(notificationService.notifyDigest.mock.calls[0][1].title).toBe('Monthly division digest');
		expect(userRepo.markDigestSent).toHaveBeenCalledWith('rd-1', 'monthly');
		expect(userRepo.markDigestSent).not.toHaveBeenCalledWith('rd-1', 'weekly');
	});

	test('both fire independently, in the same check, when both are overdue', async () => {
		const now = Date.now();
		userRepo.findDigestTimestamps.mockResolvedValue({
			lastWeeklyDigestAt: new Date(now - (WEEK_MS + 60_000)).toISOString(),
			lastMonthlyDigestAt: new Date(now - (MONTH_MS + 60_000)).toISOString(),
		});

		digestService.maybeSendDigests(actor, summary);
		await flush();

		expect(notificationService.notifyDigest).toHaveBeenCalledTimes(2);
		const titles = notificationService.notifyDigest.mock.calls.map((call) => call[1].title).sort();
		expect(titles).toEqual(['Monthly division digest', 'Weekly division digest']);
	});

	test('a division with no reported schemes yet gets "no schemes reported yet" in the body, never a null/NaN%', async () => {
		const now = Date.now();
		userRepo.findDigestTimestamps.mockResolvedValue({
			lastWeeklyDigestAt: new Date(now - (WEEK_MS + 60_000)).toISOString(),
			lastMonthlyDigestAt: new Date(now - 60_000).toISOString(),
		});
		const emptySummary = { ...summary, overallProgress: { avgProgressPct: null, schemesReported: 0, schemesTotal: 20 } };

		digestService.maybeSendDigests(actor, emptySummary);
		await flush();

		const body = notificationService.notifyDigest.mock.calls[0][1].body;
		expect(body).toContain('no schemes reported yet');
		expect(body).not.toContain('null');
		expect(body).not.toContain('NaN');
	});

	test('a division with zero critical issues omits the critical-count parenthetical entirely', async () => {
		const now = Date.now();
		userRepo.findDigestTimestamps.mockResolvedValue({
			lastWeeklyDigestAt: new Date(now - (WEEK_MS + 60_000)).toISOString(),
			lastMonthlyDigestAt: new Date(now - 60_000).toISOString(),
		});
		const noCriticalSummary = { ...summary, issues: { open: 2, bySeverity: { CRITICAL: 0, HIGH: 1, MEDIUM: 1, LOW: 0 } } };

		digestService.maybeSendDigests(actor, noCriticalSummary);
		await flush();

		const body = notificationService.notifyDigest.mock.calls[0][1].body;
		expect(body).toContain('2 open issues.');
		expect(body).not.toContain('critical');
	});

	test('a user with no users row found (defensive — should never happen in practice) is a safe no-op, never throws', async () => {
		userRepo.findDigestTimestamps.mockResolvedValue(null);

		digestService.maybeSendDigests(actor, summary);
		await flush();

		expect(notificationService.notifyDigest).not.toHaveBeenCalled();
		expect(userRepo.markDigestSent).not.toHaveBeenCalled();
	});
});
