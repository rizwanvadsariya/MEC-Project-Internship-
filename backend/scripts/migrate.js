/**
 * Applies db/migrations/*.sql in filename order against DIRECT_URL (the session
 * pooler / direct connection — never the transaction pooler), each file in its
 * own transaction, and records applied files in `schema_migrations`.
 *
 * Usage:
 *   node scripts/migrate.js            apply pending migrations
 *   node scripts/migrate.js --status   list applied vs pending, apply nothing
 *
 * Migrations are immutable once applied — add a new numbered file to change the
 * schema, never edit one that has already run.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const MIGRATIONS_DIR = path.resolve(__dirname, '../db/migrations');
const statusOnly = process.argv.includes('--status');

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString || connectionString.includes('REPLACE_ME')) {
  console.error('DIRECT_URL / DATABASE_URL is not set in backend/.env');
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  await client.query(`
    create table if not exists schema_migrations (
      filename   text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const applied = new Set(
    (await client.query('select filename from schema_migrations')).rows.map((r) => r.filename),
  );
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (statusOnly) {
    for (const f of files) console.log(`${applied.has(f) ? '✓ applied' : '· pending'}  ${f}`);
    await client.end();
    return;
  }

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`· skip   ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    process.stdout.write(`→ apply  ${file} ... `);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations (filename) values ($1)', [file]);
      await client.query('commit');
      console.log('ok');
      ran += 1;
    } catch (err) {
      await client.query('rollback');
      console.log('FAILED');
      console.error(`\n${err.message}\n`);
      await client.end();
      process.exit(1);
    }
  }
  console.log(ran ? `\n${ran} migration(s) applied.` : '\nUp to date — nothing to apply.');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
