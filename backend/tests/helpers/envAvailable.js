/**
 * Whether backend/.env exists and is filled in. Anything that requires
 * src/config (directly, or transitively via src/app or a repository) calls
 * process.exit(1) at require-time if a required var is missing or still a
 * REPLACE_ME placeholder (src/config/index.js) — fine for the running app,
 * fatal for a Jest worker if hit unconditionally. Gate those requires behind
 * this check (and keep the require() itself lazy, e.g. inside beforeAll) so
 * CI / a machine with no backend/.env skips gracefully instead of killing the
 * whole test run.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function envAvailable() {
	const envPath = path.resolve(__dirname, '../../.env');
	if (!fs.existsSync(envPath)) return false;
	const content = fs.readFileSync(envPath, 'utf8');
	return !content.includes('REPLACE_ME');
}

module.exports = { envAvailable };
