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
const os = require('os');
require('dotenv').config();

function getLanAddress() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.')) {
        return entry.address;
      }
    }
  }
  return 'localhost';
}

const apiBaseUrl = process.env.API_BASE_URL || `http://${getLanAddress()}:4000/api/v1`;

module.exports = {
  expo: {
    name: 'M&E Monitoring',
    slug: 'mec-monitoring',
    scheme: 'mec',
    version: '0.1.0',
    orientation: 'portrait',
    plugins: ['expo-secure-store', 'expo-font', '@react-native-community/datetimepicker', 'expo-image-picker', 'expo-notifications'],
    extra: {
      apiBaseUrl,
    },
  },
};
