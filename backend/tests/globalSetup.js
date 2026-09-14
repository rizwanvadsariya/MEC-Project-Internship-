/**
 * Runs once before the whole Jest run (jest.config.js's `globalSetup`).
 *
 * RLS integration tests run against the real Supabase project (backend/.env's
 * DIRECT_URL) using the 4 real seeded test accounts (db/seeds/seedTestAccounts.js)
 * — not a faked auth schema. Docker isn't available on every dev machine, so
 * the originally-planned disposable-Postgres-with-a-fake-auth-schema approach
 * (docker-compose.yml at the repo root) isn't wired up; this is the simpler
 * alternative that was already proven to work manually (Memory.md "Row-Level
 * Security" — 22/22 checks). Only *reference-data lookups* + operational
 * fixtures (teams/visits/comments, always cleaned up) touch the DB — nothing
 * ever writes to auth.users directly here.
 *
 * If DIRECT_URL isn't configured or the 4 test accounts don't exist yet (CI,
 * or a machine with no backend/.env), RLS tests skip themselves rather than
 * fail the whole suite — see tests/helpers/pgTestClient.js.
 */
'use strict';

const path = require('path');
const { Client } = require('pg');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const TEST_EMAILS = ['dg.test@mec.local', 'rd.test@mec.local', 'meo.test@mec.local', 'support.test@mec.local'];

module.exports = async function globalSetup() {
  const connectionString = process.env.DIRECT_URL;
  if (!connectionString || connectionString.includes('REPLACE_ME')) {
    console.warn('\n[rls tests] DIRECT_URL not configured (no backend/.env) — skipping RLS integration tests.\n');
    process.env.RLS_TEST_DB_URL = '';
    return;
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const { rows } = await client.query('select email from users where email = any($1)', [TEST_EMAILS]);
    if (rows.length < TEST_EMAILS.length) {
      console.warn(`\n[rls tests] Not all 4 seeded test accounts exist yet (run \`npm run seed:accounts\`) — skipping.\n`);
      process.env.RLS_TEST_DB_URL = '';
      return;
    }
    process.env.RLS_TEST_DB_URL = connectionString;
  } catch (err) {
    console.warn(`\n[rls tests] Could not reach Supabase (${err.message}) — skipping RLS integration tests.\n`);
    process.env.RLS_TEST_DB_URL = '';
  } finally {
    await client.end();
  }
};
