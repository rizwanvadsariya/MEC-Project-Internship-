/**
 * Flat config (ESLint 9+ / 10 ignores .eslintrc.json entirely). Equivalent to
 * the old `{ env: { node, es2023, jest }, extends: ["eslint:recommended"] }`.
 */
'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {},
  },
  {
    ignores: ['node_modules/**', 'coverage/**'],
  },
];
