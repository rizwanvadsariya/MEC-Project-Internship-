/** Unit: notification.service's push-token CRUD, in-app list/markRead, and
 *  the three phases.md Step 17 triggers (team decision, visit completed,
 *  issue filed — folded into visit-completed per Step 15's draft-invisibility
 *  rule, see notification.service.js's own comment). Mocks every repo + the
 *  push sender, so the real modules — which need backend/.env — are never
 *  loaded; this suite must run in CI with no .env too. `runInBackground` is
 *  mocked to invoke its function immediately and return the promise, so
 *  `flush()` can await the most recent trigger's background work
 *  deterministically instead of guessing at a setTimeout. */
'use strict';

jest.mock('../../../src/repositories/notification.repo', () => ({
	create: jest.fn(),
	listForUser: jest.fn(),
	markRead: jest.fn(),
	countUnread: jest.fn(),
	findDivisionLeadership: jest.fn(),
	findSchemeBasics: jest.fn(),
	findVisitNotificationContext: jest.fn(),
}));
jest.mock('../../../src/repositories/pushToken.repo', () => ({
	upsert: jest.fn(),
	removeForUser: jest.fn(),
	removeToken: jest.fn(),
	findTokensForUsers: jest.fn(),
}));
jest.mock('../../../src/repositories/team.repo', () => ({ getById: jest.fn() }));
jest.mock('../../../src/repositories/issue.repo', () => ({ list: jest.fn() }));
jest.mock('../../../src/lib/pushSender', () => ({ sendPushNotifications: jest.fn() }));
jest.mock('../../../src/lib/backgroundTask', () => ({ runInBackground: jest.fn((fn) => fn()) }));

const notificationRepo = require('../../../src/repositories/notification.repo');
const pushTokenRepo = require('../../../src/repositories/pushToken.repo');
const teamRepo = require('../../../src/repositories/team.repo');
const issueRepo = require('../../../src/repositories/issue.repo');
const { sendPushNotifications } = require('../../../src/lib/pushSender');
const { runInBackground } = require('../../../src/lib/backgroundTask');
const notificationService = require('../../../src/services/notification.service');
const ApiError = require('../../../src/lib/ApiError');

async function flush() {
	const last = runInBackground.mock.results[runInBackground.mock.results.length - 1];
	await last.value;
}

beforeEach(() => {
	jest.clearAllMocks();
	notificationRepo.create.mockResolvedValue([]);
	pushTokenRepo.findTokensForUsers.mockResolvedValue([]);
	sendPushNotifications.mockResolvedValue({ sent: 0, invalidTokens: [] });
});

describe('registerPushToken / removePushToken', () => {
	test('accepts a valid Expo push token and upserts it for the actor', async () => {
		pushTokenRepo.upsert.mockResolvedValue({ id: 'pt-1' });

		const result = await notificationService.registerPushToken({ id: 'user-1' }, 'ExponentPushToken[abc123]', 'android');

		expect(pushTokenRepo.upsert).toHaveBeenCalledWith('user-1', 'ExponentPushToken[abc123]', 'android');
		expect(result).toEqual({ id: 'pt-1' });
	});

	test('rejects a malformed token before ever touching the repo', async () => {
		await expect(notificationService.registerPushToken({ id: 'user-1' }, 'not-a-real-token', 'ios')).rejects.toMatchObject({ statusCode: 400 });
		expect(pushTokenRepo.upsert).not.toHaveBeenCalled();
	});

	test('removePushToken scopes deletion to the actor\'s own id', async () => {
		await notificationService.removePushToken({ id: 'user-1' }, 'ExponentPushToken[abc123]');
		expect(pushTokenRepo.removeForUser).toHaveBeenCalledWith('user-1', 'ExponentPushToken[abc123]');
	});
});

describe('list / markRead', () => {
	test('list decodes the cursor and delegates to the repo scoped by actor id', async () => {
		notificationRepo.listForUser.mockResolvedValue({ rows: [{ id: 'n1' }], nextCursor: null });

		const result = await notificationService.list({ id: 'user-1' }, { cursor: '2026-01-01T00:00:00.000Z_n0', limit: 10 });

		expect(notificationRepo.listForUser).toHaveBeenCalledWith('user-1', {
			limit: 10,
			cursor: { createdAt: '2026-01-01T00:00:00.000Z', id: 'n0' },
		});
		expect(result).toEqual({ rows: [{ id: 'n1' }], nextCursor: null });
	});

	test('markRead throws 404 when the repo finds no matching row for that actor', async () => {
		notificationRepo.markRead.mockResolvedValue(null);
		await expect(notificationService.markRead({ id: 'user-1' }, 'n1')).rejects.toBeInstanceOf(ApiError);
	});

	test('markRead returns the updated row on success', async () => {
		notificationRepo.markRead.mockResolvedValue({ id: 'n1', isRead: true });
		await expect(notificationService.markRead({ id: 'user-1' }, 'n1')).resolves.toEqual({ id: 'n1', isRead: true });
	});
});

describe('notifyTeamDecision', () => {
	test('APPROVED notifies the creator and every team member', async () => {
		teamRepo.getById.mockResolvedValue({ id: 'team-1', schemeId: 30, createdBy: 'rd-1', members: [{ userId: 'meo-1' }, { userId: 'support-1' }] });
		notificationRepo.findSchemeBasics.mockResolvedValue({ uid: 'S1', name: 'Water Scheme' });

		notificationService.notifyTeamDecision('team-1', 'APPROVED');
		await flush();

		expect(notificationRepo.create.mock.calls[0][0]).toHaveLength(3);
		expect(notificationRepo.create).toHaveBeenCalledWith(expect.arrayContaining([
			expect.objectContaining({ userId: 'rd-1', title: 'Team approved' }),
			expect.objectContaining({ userId: 'meo-1', title: 'Team approved' }),
			expect.objectContaining({ userId: 'support-1', title: 'Team approved' }),
		]));
	});

	test('REJECTED notifies only the creator, not the rest of the team', async () => {
		teamRepo.getById.mockResolvedValue({ id: 'team-1', schemeId: 30, createdBy: 'rd-1', members: [{ userId: 'meo-1' }] });
		notificationRepo.findSchemeBasics.mockResolvedValue({ uid: 'S1', name: 'Water Scheme' });

		notificationService.notifyTeamDecision('team-1', 'REJECTED');
		await flush();

		expect(notificationRepo.create).toHaveBeenCalledWith([expect.objectContaining({ userId: 'rd-1', title: 'Team rejected' })]);
	});

	test('a team that no longer exists is a silent no-op, not a thrown error', async () => {
		teamRepo.getById.mockResolvedValue(null);

		notificationService.notifyTeamDecision('team-404', 'APPROVED');
		await flush();

		expect(notificationRepo.create).not.toHaveBeenCalled();
	});
});

describe('notifyVisitCompleted', () => {
	test('notifies the team creator and division leadership, and fires "issue filed" for every issue on that visit', async () => {
		notificationRepo.findVisitNotificationContext.mockResolvedValue({
			schemeName: 'Water Scheme',
			createdBy: 'rd-1',
			teamMemberIds: ['meo-1', 'support-1'],
			divisionLeadershipIds: ['dg-1'],
		});
		issueRepo.list.mockResolvedValue([{ id: 'issue-1', reportedBy: 'meo-1', severity: 'HIGH', issueType: 'Leak' }]);

		notificationService.notifyVisitCompleted('visit-1');
		await flush();

		expect(notificationRepo.create.mock.calls[0][0]).toEqual(expect.arrayContaining([
			expect.objectContaining({ userId: 'rd-1', title: 'Site visit completed' }),
			expect.objectContaining({ userId: 'dg-1', title: 'Site visit completed' }),
		]));
		expect(notificationRepo.create.mock.calls[1][0]).toEqual(expect.arrayContaining([
			expect.objectContaining({ userId: 'support-1', title: 'HIGH issue reported' }),
			expect.objectContaining({ userId: 'dg-1', title: 'HIGH issue reported' }),
		]));
		// The issue's own reporter never gets notified about their own filing.
		expect(notificationRepo.create.mock.calls[1][0].some((row) => row.userId === 'meo-1')).toBe(false);
	});

	test('no issues filed means only the "visit completed" notification fires', async () => {
		notificationRepo.findVisitNotificationContext.mockResolvedValue({
			schemeName: 'Water Scheme', createdBy: 'rd-1', teamMemberIds: ['meo-1'], divisionLeadershipIds: [],
		});
		issueRepo.list.mockResolvedValue([]);

		notificationService.notifyVisitCompleted('visit-1');
		await flush();

		expect(notificationRepo.create).toHaveBeenCalledTimes(1);
	});

	test('a site visit with no resolvable context is a silent no-op', async () => {
		notificationRepo.findVisitNotificationContext.mockResolvedValue(null);

		notificationService.notifyVisitCompleted('visit-404');
		await flush();

		expect(notificationRepo.create).not.toHaveBeenCalled();
		expect(issueRepo.list).not.toHaveBeenCalled();
	});
});

describe('dispatch (push fan-out, exercised via notifyTeamDecision)', () => {
	test('a DeviceNotRegistered response prunes that token from push_tokens', async () => {
		teamRepo.getById.mockResolvedValue({ id: 'team-1', schemeId: 30, createdBy: 'rd-1', members: [] });
		notificationRepo.findSchemeBasics.mockResolvedValue({ name: 'Water Scheme' });
		pushTokenRepo.findTokensForUsers.mockResolvedValue([{ userId: 'rd-1', token: 'ExponentPushToken[stale]' }]);
		sendPushNotifications.mockResolvedValue({ sent: 0, invalidTokens: ['ExponentPushToken[stale]'] });

		notificationService.notifyTeamDecision('team-1', 'APPROVED');
		await flush();

		expect(sendPushNotifications).toHaveBeenCalledWith([expect.objectContaining({ to: 'ExponentPushToken[stale]' })]);
		expect(pushTokenRepo.removeToken).toHaveBeenCalledWith('ExponentPushToken[stale]');
	});

	test('no recipients means no notification row, no token lookup, no push call at all', async () => {
		teamRepo.getById.mockResolvedValue({ id: 'team-1', schemeId: 30, createdBy: null, members: [] });
		notificationRepo.findSchemeBasics.mockResolvedValue({ name: 'Water Scheme' });

		notificationService.notifyTeamDecision('team-1', 'REJECTED');
		await flush();

		expect(notificationRepo.create).not.toHaveBeenCalled();
		expect(pushTokenRepo.findTokensForUsers).not.toHaveBeenCalled();
		expect(sendPushNotifications).not.toHaveBeenCalled();
	});
});
