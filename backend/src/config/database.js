/**
 * PostgreSQL connection pool via the Supabase transaction pooler / PgBouncer
 * (architecture.md §5.1). The repositories layer is the only consumer.
 *
 * Transaction-pooler constraints — repositories must honour these:
 *   - no LISTEN/NOTIFY, no session-level SET, no explicit PREPARE
 *   - plain parameterized queries only ($1, $2 ...); never pass `name` to query()
 */
'use strict';

const { Pool } = require('pg');
const { config } = require('./index');
const logger = require('../lib/logger');

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  // Supabase requires TLS. rejectUnauthorized:false trusts the pooler's cert
  // without pinning — swap in Supabase's CA bundle to pin in production.
  ssl: { rejectUnauthorized: false },
  max: 10, // (Render instances × max) must stay under the project's connection limit
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 15_000,
  application_name: 'mec-backend',
});

pool.on('error', (err) => logger.error({ err }, 'idle pg client error'));

/** Run a parameterized query against the pool. */
const query = (text, params) => pool.query(text, params);

/** Liveness probe for /health and startup checks. */
async function ping() {
  const { rows } = await pool.query('select now() as now');
  return rows[0].now;
}

async function close() {
  await pool.end();
}

module.exports = { pool, query, ping, close };
