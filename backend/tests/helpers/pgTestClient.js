/**
 * Connects to the real Supabase project (via DIRECT_URL, checked by
 * tests/globalSetup.js) and simulates a specific authenticated user the same
 * way it was verified manually (Memory.md "Row-Level Security"): SET ROLE
 * authenticated + SET request.jwt.claims, inside a transaction that's always
 * rolled back so nothing a test does — including successful writes it's
 * checking for — persists.
 */
'use strict';

const { Client } = require('pg');

function dbAvailable() {
  return !!process.env.RLS_TEST_DB_URL;
}

async function getClient() {
  const client = new Client({ connectionString: process.env.RLS_TEST_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

/** Run `fn(client)` as `userId` (authenticated role, that user's JWT claims),
 *  inside a transaction that is always rolled back afterward. */
async function asUser(client, userId, fn) {
  await client.query('begin');
  try {
    await client.query('set local role authenticated');
    await client.query(`set local request.jwt.claims = '${JSON.stringify({ sub: userId, role: 'authenticated' })}'`);
    return await fn();
  } finally {
    await client.query('rollback');
  }
}

/** Run `fn(client)` as the unauthenticated `anon` role. */
async function asAnon(client, fn) {
  await client.query('begin');
  try {
    await client.query('set local role anon');
    return await fn();
  } finally {
    await client.query('rollback');
  }
}

module.exports = { dbAvailable, getClient, asUser, asAnon };
