/**
 * Sends push notifications via Expo's Push API (a single HTTPS POST — no
 * expo-server-sdk dependency needed for this). Never throws: a failed or
 * partial batch is logged and returned, never surfaced to the caller, since
 * this only ever runs inside a background task (backgroundTask.js) and a
 * push-delivery failure must never look like the request that triggered it
 * failed.
 */
'use strict';

const logger = require('./logger');
const { config } = require('../config');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100; // Expo's own per-request cap

function chunk(array, size) {
	const chunks = [];
	for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
	return chunks;
}

/**
 * messages: [{ to, title, body, data }]. Returns { sent, invalidTokens } —
 * invalidTokens are tokens Expo reported as DeviceNotRegistered (app was
 * uninstalled, token revoked, etc.), for the caller to prune from push_tokens
 * so they stop being sent to on every future notification.
 */
async function sendPushNotifications(messages) {
	if (!config.PUSH_NOTIFICATIONS_ENABLED || !messages.length) return { sent: 0, invalidTokens: [] };

	let sent = 0;
	const invalidTokens = [];

	for (const batch of chunk(messages, CHUNK_SIZE)) {
		try {
			const res = await fetch(EXPO_PUSH_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
					...(config.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${config.EXPO_ACCESS_TOKEN}` } : {}),
				},
				body: JSON.stringify(batch),
			});
			const json = await res.json().catch(() => null);
			const tickets = json?.data ?? [];
			tickets.forEach((ticket, index) => {
				if (ticket.status === 'ok') {
					sent += 1;
				} else if (ticket.details?.error === 'DeviceNotRegistered') {
					invalidTokens.push(batch[index].to);
				} else {
					logger.warn({ ticket, to: batch[index]?.to }, '[pushSender] Expo push ticket error');
				}
			});
		} catch (err) {
			logger.error({ err }, '[pushSender] Failed to reach Expo push API');
		}
	}

	return { sent, invalidTokens };
}

module.exports = { sendPushNotifications };
