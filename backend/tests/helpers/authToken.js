/**
 * Mint a real, JWKS-verifiable access token for a seeded test account
 * (db/seeds/seedTestAccounts.js). Supabase issues asymmetric JWTs, so a token
 * can't be fabricated locally — authenticate.js verifies against Supabase's
 * real JWKS endpoint. Instead this resets the account's password to a known
 * test-only value via the service-role admin client, then logs in through the
 * real POST /auth/login route (the same path a real client uses), exactly
 * like tests/helpers/pgTestClient.js simulates users for RLS but for the full
 * HTTP + JWT path instead of a raw DB connection.
 *
 * Side effect: running these tests overwrites the seeded test accounts'
 * passwords (the ones seedTestAccounts.js prints once to console) with
 * TEST_PASSWORD below. That's expected for dev/test-only accounts — same
 * spirit as rlsFixtures.js mutating real rows in the live Supabase project.
 *
 * Requires src/app (and everything it pulls in, incl. src/config) — only
 * require this module where tests/helpers/envAvailable.js has already
 * confirmed backend/.env is present, and only from inside a beforeAll/test,
 * never at a describe block's top level (see envAvailable.js for why).
 */
'use strict';

const TEST_EMAILS = Object.freeze({
	DIRECTOR_GENERAL: 'dg.test@mec.local',
	REGIONAL_DIRECTOR: 'rd.test@mec.local',
	MEO: 'meo.test@mec.local',
	SUPPORT_USER: 'support.test@mec.local',
});

const TEST_PASSWORD = 'Test!Integration-Pw1';

const tokenCache = new Map();
const idCache = new Map();

async function getAccessToken(role) {
	if (tokenCache.has(role)) return tokenCache.get(role);

	const email = TEST_EMAILS[role];
	if (!email) throw new Error(`Unknown test role: ${role}`);

	const request = require('supertest');
	const app = require('../../src/app');
	const { supabase } = require('../../src/config/supabase');
	const userRepo = require('../../src/repositories/user.repo');

	const profile = await userRepo.findByEmail(email);
	if (!profile) throw new Error(`Seeded test account missing: ${email} — run \`npm run seed:accounts\``);
	idCache.set(role, profile.id);

	const { error: updateError } = await supabase.auth.admin.updateUserById(profile.id, { password: TEST_PASSWORD });
	if (updateError) throw new Error(`Could not set test password for ${email}: ${updateError.message}`);

	const res = await request(app).post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD });
	if (res.status !== 200 || !res.body?.data?.session?.access_token) {
		throw new Error(`Login failed for ${email} (${res.status}): ${JSON.stringify(res.body)}`);
	}

	tokenCache.set(role, res.body.data.session.access_token);
	return tokenCache.get(role);
}

/** The `users.id` for a role's seeded account — only populated once getAccessToken(role) has run. */
function getUserId(role) {
	return idCache.get(role);
}

module.exports = { getAccessToken, getUserId, TEST_EMAILS, TEST_PASSWORD };
