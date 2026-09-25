/**
 * In-app notification list query + push-token register/remove bodies.
 */
'use strict';

const { z } = require('zod');

// z.coerce.boolean() would turn the STRING "false" into `true` — same
// footgun documented in config/index.js's boolFromEnv; read "true"/"false" as words instead.
const boolFromQuery = z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() === 'true' : v), z.boolean()).optional();

const query = {
	query: z.object({
		unreadOnly: boolFromQuery,
		cursor: z.string().max(80).optional(),
		limit: z.coerce.number().int().min(1).max(50).default(20),
	}),
};

const idParam = { params: z.object({ id: z.string().uuid() }) };

const registerPushToken = {
	body: z.object({
		token: z.string().min(10).max(400),
		platform: z.enum(['ios', 'android']),
	}),
};

const removePushToken = {
	body: z.object({ token: z.string().min(10).max(400) }),
};

module.exports = { query, idParam, registerPushToken, removePushToken };
