/** Unit: sendPushNotifications talks to Expo's push API over global fetch,
 *  chunks batches, tallies "ok" tickets, and surfaces DeviceNotRegistered
 *  tokens for pruning — all without ever throwing, even on a network failure.
 *  Mocks src/config so this never touches a real backend/.env. */
'use strict';

jest.mock('../../../src/config', () => ({
	config: { PUSH_NOTIFICATIONS_ENABLED: true, EXPO_ACCESS_TOKEN: undefined },
}));
jest.mock('../../../src/lib/logger', () => ({ warn: jest.fn(), error: jest.fn() }));

const { config } = require('../../../src/config');
const logger = require('../../../src/lib/logger');
const { sendPushNotifications } = require('../../../src/lib/pushSender');

const originalFetch = global.fetch;

afterEach(() => {
	global.fetch = originalFetch;
	jest.clearAllMocks();
	config.PUSH_NOTIFICATIONS_ENABLED = true;
	config.EXPO_ACCESS_TOKEN = undefined;
});

test('does nothing (and never calls fetch) when disabled via config', async () => {
	config.PUSH_NOTIFICATIONS_ENABLED = false;
	global.fetch = jest.fn();

	const result = await sendPushNotifications([{ to: 'ExponentPushToken[x]', title: 't', body: 'b' }]);

	expect(result).toEqual({ sent: 0, invalidTokens: [] });
	expect(global.fetch).not.toHaveBeenCalled();
});

test('does nothing when there are no messages', async () => {
	global.fetch = jest.fn();

	const result = await sendPushNotifications([]);

	expect(result).toEqual({ sent: 0, invalidTokens: [] });
	expect(global.fetch).not.toHaveBeenCalled();
});

test('posts to the Expo push API and counts "ok" tickets as sent', async () => {
	global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ data: [{ status: 'ok' }, { status: 'ok' }] }) });

	const result = await sendPushNotifications([
		{ to: 'ExponentPushToken[a]', title: 't1', body: 'b1' },
		{ to: 'ExponentPushToken[b]', title: 't2', body: 'b2' },
	]);

	expect(global.fetch).toHaveBeenCalledWith('https://exp.host/--/api/v2/push/send', expect.objectContaining({ method: 'POST' }));
	expect(result).toEqual({ sent: 2, invalidTokens: [] });
});

test('collects DeviceNotRegistered tokens for the caller to prune, without counting them as sent', async () => {
	global.fetch = jest.fn().mockResolvedValue({
		json: async () => ({
			data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }],
		}),
	});

	const result = await sendPushNotifications([
		{ to: 'ExponentPushToken[good]', title: 't1', body: 'b1' },
		{ to: 'ExponentPushToken[stale]', title: 't2', body: 'b2' },
	]);

	expect(result).toEqual({ sent: 1, invalidTokens: ['ExponentPushToken[stale]'] });
});

test('a non-DeviceNotRegistered ticket error is logged but does not throw or get pruned', async () => {
	global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ data: [{ status: 'error', details: { error: 'MessageTooBig' } }] }) });

	const result = await sendPushNotifications([{ to: 'ExponentPushToken[x]', title: 't', body: 'b' }]);

	expect(result).toEqual({ sent: 0, invalidTokens: [] });
	expect(logger.warn).toHaveBeenCalled();
});

test('a network failure is caught and logged, never thrown', async () => {
	global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

	await expect(sendPushNotifications([{ to: 'ExponentPushToken[x]', title: 't', body: 'b' }])).resolves.toEqual({ sent: 0, invalidTokens: [] });
	expect(logger.error).toHaveBeenCalled();
});

test('chunks more than 100 messages into separate Expo API requests', async () => {
	global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ data: [] }) });
	const messages = Array.from({ length: 150 }, (_, i) => ({ to: `ExponentPushToken[${i}]`, title: 't', body: 'b' }));

	await sendPushNotifications(messages);

	expect(global.fetch).toHaveBeenCalledTimes(2);
	expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toHaveLength(100);
	expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toHaveLength(50);
});

test('adds an Authorization header only when EXPO_ACCESS_TOKEN is configured', async () => {
	config.EXPO_ACCESS_TOKEN = 'secret-token';
	global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ data: [] }) });

	await sendPushNotifications([{ to: 'ExponentPushToken[x]', title: 't', body: 'b' }]);

	expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer secret-token');
});
