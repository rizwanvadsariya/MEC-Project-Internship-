/**
 * Test-only. jose v6 ships ESM-only (no CJS build) — Jest's CJS test files
 * `require('jose')` (src/middleware/authenticate.js), which needs Jest's
 * default babel-jest transform to actually convert jose's import/export
 * syntax to CommonJS; that transform is a no-op without any babel config
 * present, and jest.config.js's transformIgnorePatterns has to let it reach
 * node_modules/jose in the first place. Plain `node src/server.js` never
 * touches this file — Node itself already supports require-of-ESM natively
 * (22.12+/24+), which is why this is scoped to tests only.
 */
'use strict';
module.exports = {
	presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
};
