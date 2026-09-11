/**
 * Creates one Supabase Auth user per role (RD, DG, MEO, SUPPORT_USER) with a
 * division/department assigned, and the mirror row in `public.users`.
 * phases.md Step 3. Dev/staging only.
 *
 * This is the bootstrap exception to hardening point #1 (invite links): these
 * 4 accounts get a known password via `admin.createUser` directly, because we
 * need to log in as them to verify the auth setup. It's also the only way the
 * very first accounts can exist at all — "only a DG can provision accounts"
 * is circular until one DG exists (see Memory.md "Planned: Supabase Auth
 * setup" — the bootstrap problem).
 *
 * Idempotent: re-running skips any account whose `public.users` row already
 * exists (matched by email).
 *
 * Usage: node db/seeds/seedTestAccounts.js
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const crypto = require('crypto');
const { supabase } = require('../../src/config/supabase');
const { pool } = require('../../src/config/database');
const userRepo = require('../../src/repositories/user.repo');
const { ROLES } = require('../../src/constants/roles');

function randomSuffix() {
  return crypto.randomBytes(3).toString('hex');
}

// divisionId 1 = Karachi, departmentId 1 = "AGRICULTURE, SUPPLY & PRICES"
// (first rows of the imported ADP reference data — see adp-database-seed-csv/).
const ACCOUNTS = [
  {
    role: ROLES.DIRECTOR_GENERAL,
    email: 'dg.test@mec.local',
    fullName: 'Test Director General',
    divisionId: 1,
    departmentId: null,
  },
  {
    role: ROLES.REGIONAL_DIRECTOR,
    email: 'rd.test@mec.local',
    fullName: 'Test Regional Director',
    divisionId: 1,
    departmentId: null,
  },
  {
    role: ROLES.MEO,
    email: 'meo.test@mec.local',
    fullName: 'Test Lead MEO',
    divisionId: 1,
    departmentId: null,
  },
  {
    role: ROLES.SUPPORT_USER,
    email: 'support.test@mec.local',
    fullName: 'Test Support User',
    // SUPPORT_USER is the one role the DB's own CHECK constraint exempts from
    // requiring a division — leaving this null exercises that exemption.
    divisionId: null,
    departmentId: 1,
  },
];

async function main() {
  const created = [];

  for (const account of ACCOUNTS) {
    const existing = await userRepo.findByEmail(account.email);
    if (existing) {
      console.log(`· skip   ${account.role.padEnd(18)} ${account.email} (already provisioned)`);
      continue;
    }

    const password = `Dev!${account.role.slice(0, 3)}-${randomSuffix()}`;
    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: account.fullName },
    });

    if (error || !data?.user) {
      console.error(`✗ FAILED  ${account.role.padEnd(18)} ${account.email}: ${error?.message || 'unknown error'}`);
      continue;
    }

    await userRepo.insertProfile({
      id: data.user.id,
      fullName: account.fullName,
      email: account.email,
      role: account.role,
      divisionId: account.divisionId,
      departmentId: account.departmentId,
    });

    console.log(`→ created ${account.role.padEnd(18)} ${account.email}`);
    created.push({ ...account, password });
  }

  if (created.length) {
    console.log('\nTest credentials (dev-only — never commit, never reuse in production):');
    for (const c of created) {
      console.log(`  ${c.role.padEnd(18)} ${c.email}  /  ${c.password}`);
    }
  } else {
    console.log('\nNo new accounts created — all 4 already exist.');
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exitCode = 1;
});
