'use strict';
module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  globalSetup: '<rootDir>/tests/globalSetup.js',
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
};
