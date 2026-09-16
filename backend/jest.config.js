'use strict';
module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  globalSetup: '<rootDir>/tests/globalSetup.js',
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  // node_modules is untransformed by default (for speed); jose v6 is
  // ESM-only, and authenticate.js's `require('jose')` needs babel.config.js's
  // transform to actually reach it — see that file for the full story.
  transformIgnorePatterns: ['node_modules/(?!(jose)/)'],
};
