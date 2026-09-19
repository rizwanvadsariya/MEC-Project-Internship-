#!/usr/bin/env node
/**
 * Detects this machine's current LAN IPv4 address and launches Expo with
 * API_BASE_URL pointed at it, instead of relying on a manually-edited .env
 * value that goes stale the moment the machine's DHCP lease changes (or the
 * dev switches Wi-Fi networks) — see Memory.md's "hardcoded-LAN-IP" note.
 *
 * This always overrides API_BASE_URL, even if .env or the shell environment
 * already sets one, so `npm run start:lan` never silently uses a stale IP.
 */
'use strict';

const os = require('os');
const { spawnSync } = require('child_process');

function detectLanIp() {
	const interfaces = os.networkInterfaces();
	const candidates = [];
	for (const [name, addresses] of Object.entries(interfaces)) {
		for (const address of addresses ?? []) {
			if (address.family === 'IPv4' && !address.internal) {
				candidates.push({ name, address: address.address });
			}
		}
	}
	if (!candidates.length) return null;

	// Prefer an adapter that looks like Wi-Fi/Ethernet over VPN/virtual ones
	// (Hyper-V, VirtualBox, WSL, Tailscale, etc.) commonly present on dev machines.
	const preferred = candidates.find((c) => /wi-?fi|wireless|ethernet/i.test(c.name))
		?? candidates.find((c) => !/virtual|vethernet|vmware|virtualbox|wsl|tailscale|hyper-v|loopback/i.test(c.name))
		?? candidates[0];
	return preferred.address;
}

const ip = detectLanIp();
if (!ip) {
	console.error('[start-lan] Could not detect a LAN IPv4 address. Connect to Wi-Fi/Ethernet and try again, or run `npm start` with API_BASE_URL set manually.');
	process.exit(1);
}

const apiBaseUrl = `http://${ip}:4000/api/v1`;
console.log(`[start-lan] Detected LAN IP ${ip} — starting Expo with API_BASE_URL=${apiBaseUrl}`);

// Pass through any extra flags (e.g. `--tunnel`) given to the npm script.
const extraArgs = process.argv.slice(2);
const result = spawnSync('npx', ['expo', 'start', ...extraArgs], {
	stdio: 'inherit',
	shell: true,
	env: { ...process.env, API_BASE_URL: apiBaseUrl },
});
process.exit(result.status ?? 0);
