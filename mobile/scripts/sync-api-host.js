const fs = require('fs');
const os = require('os');
const path = require('path');

function getLanAddress() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.')) {
        return entry.address;
      }
    }
  }
  throw new Error('No LAN IPv4 address found. Connect this computer to Wi-Fi first.');
}

const apiBaseUrl = `http://${getLanAddress()}:4000/api/v1`;
const envPath = path.resolve('.env');
fs.writeFileSync(envPath, `API_BASE_URL=${apiBaseUrl}\n`, 'utf8');
console.log(`[mobile] API_BASE_URL=${apiBaseUrl}`);
