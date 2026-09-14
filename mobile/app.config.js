/**
 * Dynamic config (replaces the old static app.json) so the API base URL is
 * read from an environment variable instead of being hardcoded per dev
 * machine — was app.json's `extra.apiBaseUrl`, previously stuck at whichever
 * LAN IP the last person to touch it happened to be on (see Memory.md).
 *
 * Usage:
 *   API_BASE_URL=http://192.168.1.23:4000/api/v1 npx expo start
 * or export it in your shell profile so you don't have to repeat it. Falls
 * back to localhost, which works for the iOS simulator / Android emulator
 * but NOT a physical device over Wi-Fi (see mobile/README.md).
 */
require('dotenv').config();

module.exports = {
  expo: {
    name: 'M&E Monitoring',
    slug: 'mec-monitoring',
    scheme: 'mec',
    version: '0.1.0',
    orientation: 'portrait',
    plugins: ['expo-secure-store', 'expo-font'],
    extra: {
      apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:4000/api/v1',
    },
  },
};
