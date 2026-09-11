/**
 * One-time / periodic ADP booklet import (phases.md Step 2, schema.md §3).
 * Reads the 12 reference-table CSVs exported from the government ADP ledger
 * and loads them into Supabase — divisions, districts, departments,
 * sub_sectors, funding_sources, sdg_goals, schemes, and the five junction /
 * history tables. This is the ONLY way scheme data enters the system; there
 * is no in-app create path.
 *
 * The whole import runs in one transaction: it TRUNCATEs the 12 reference
 * tables (they own no operational data yet) and reloads them from the CSVs,
 * so re-running this script is safe and idempotent.
 *
 * Usage:
 *   node db/seeds/importAdpBooklet.js [--dir <path-to-csv-folder>]
 *   npm run seed:adp
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { parse } = require('csv-parse/sync');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const argDir = (() => {
  const i = process.argv.indexOf('--dir');
  return i !== -1 ? process.argv[i + 1] : null;
})();
const CSV_DIR = argDir
  ? path.resolve(argDir)
  : path.resolve(__dirname, '../../../adp-database-seed-csv');

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString || connectionString.includes('REPLACE_ME')) {
  console.error('DIRECT_URL / DATABASE_URL is not set in backend/.env');
  process.exit(1);
}

// ---------------------------------------------------------------- helpers

function readCsv(file) {
  const full = path.join(CSV_DIR, file);
  if (!fs.existsSync(full)) throw new Error(`Missing CSV: ${full}`);
  const raw = fs.readFileSync(full, 'utf8');
  return parse(raw, { columns: true, skip_empty_lines: true, bom: true });
}

/** '' / undefined -> null; otherwise the trimmed string (fine for numeric/text params — pg parses numeric strings exactly, no float rounding). */
function nn(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** 'DD.MM.YY' -> 'YYYY-MM-DD' (booklet approval dates); '' -> null. */
function parseApprovalDate(v) {
  const s = nn(v);
  if (!s) return null;
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (!m) throw new Error(`Unexpected date_of_approval format: "${v}"`);
  const [, dd, mm, yy] = m;
  return `${2000 + Number(yy)}-${mm}-${dd}`;
}

/** 'DD-MM-YYYY' -> 'YYYY-MM-DD' (revision dates); '' -> null. */
function parseRevisionDate(v) {
  const s = nn(v);
  if (!s) return null;
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) throw new Error(`Unexpected revised_on format: "${v}"`);
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

/** Target completion is a month+year in the source (e.g. "Jun-27"), not a
 *  calendar date — kept as the literal string; 'N/A' -> null. */
function parseTargetDate(v) {
  const s = nn(v);
  if (!s || s.toUpperCase() === 'N/A') return null;
  return s;
}

function toBool(v) {
  return String(v).trim().toLowerCase() === 'true';
}

/** Drop exact duplicate rows on a composite key (the source ledger double-lists
 *  a handful of scheme/SDG pairs — same tag extracted twice, no extra data). */
function dedupeOn(rows, keyFn) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const k = keyFn(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/** Chunked multi-row INSERT. `identity: true` adds OVERRIDING SYSTEM VALUE so
 *  the CSV's own ids are preserved (other CSVs' foreign keys point at them). */
async function insertRows(client, { table, columns, rows, mapRow, identity = false, chunkSize = 500 }) {
  if (!rows.length) return 0;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = [];
    const tuples = chunk.map((row, idx) => {
      const mapped = mapRow(row);
      const base = idx * columns.length;
      values.push(...mapped);
      return `(${columns.map((_, c) => `$${base + c + 1}`).join(', ')})`;
    });
    const sql = `insert into ${table} (${columns.join(', ')}) ${identity ? 'overriding system value' : ''} values ${tuples.join(', ')}`;
    await client.query(sql, values);
    inserted += chunk.length;
  }
  return inserted;
}

/** Point the table's identity sequence past the max id we just inserted, so
 *  the next app-driven insert doesn't collide with an imported row. */
async function resyncSequence(client, table) {
  await client.query(
    `select setval(pg_get_serial_sequence($1, 'id'), coalesce((select max(id) from ${table}), 1))`,
    [table],
  );
}

// ---------------------------------------------------------------- main

async function main() {
  console.log(`Reading CSVs from: ${CSV_DIR}\n`);

  const divisions = readCsv('divisions.csv');
  const districts = readCsv('districts.csv');
  const departments = readCsv('departments.csv');
  const subSectors = readCsv('sub_sectors.csv');
  const fundingSources = readCsv('funding_sources.csv');
  const sdgGoals = readCsv('sdg_goals.csv');
  const schemes = readCsv('schemes.csv');
  const schemeDistricts = dedupeOn(readCsv('scheme_districts.csv'), (r) => `${r.scheme_id}|${r.district_id}`);
  const schemeFunding = dedupeOn(readCsv('scheme_funding.csv'), (r) => `${r.scheme_id}|${r.funding_source_id}`);
  const schemeSdg = dedupeOn(readCsv('scheme_sdg.csv'), (r) => `${r.scheme_id}|${r.sdg_id}`);
  const revisionHistory = readCsv('revision_history.csv');
  const financialYearAllocations = readCsv('financial_year_allocations.csv');

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query('begin');

    console.log('Truncating the 12 reference tables...');
    await client.query(`
      truncate table
        scheme_sdg, scheme_funding, scheme_districts,
        financial_year_allocations, revision_history, schemes,
        sdg_goals, funding_sources, sub_sectors, departments, districts, divisions
      restart identity cascade
    `);

    let n;

    n = await insertRows(client, {
      table: 'divisions', columns: ['id', 'name'], rows: divisions, identity: true,
      mapRow: (r) => [r.id, r.name],
    });
    console.log(`divisions: ${n}`);

    n = await insertRows(client, {
      table: 'districts', columns: ['id', 'division_id', 'name'], rows: districts, identity: true,
      mapRow: (r) => [r.id, r.division_id, r.name],
    });
    console.log(`districts: ${n}`);

    n = await insertRows(client, {
      table: 'departments',
      columns: ['id', 'code', 'name', 'is_program_pool', 'adp_no_from', 'adp_no_to', 'scheme_count', 'page_from', 'page_to'],
      rows: departments, identity: true,
      mapRow: (r) => [r.id, r.code, r.name, toBool(r.is_program_pool), r.adp_no_from, r.adp_no_to, r.scheme_count, r.page_from, r.page_to],
    });
    console.log(`departments: ${n}`);

    n = await insertRows(client, {
      table: 'sub_sectors', columns: ['id', 'department_id', 'name'], rows: subSectors, identity: true,
      mapRow: (r) => [r.id, r.department_id, r.name],
    });
    console.log(`sub_sectors: ${n}`);

    n = await insertRows(client, {
      table: 'funding_sources', columns: ['id', 'name', 'type'], rows: fundingSources, identity: true,
      mapRow: (r) => [r.id, r.name, r.type],
    });
    console.log(`funding_sources: ${n}`);

    n = await insertRows(client, {
      table: 'sdg_goals', columns: ['id', 'name'], rows: sdgGoals, identity: false,
      mapRow: (r) => [r.id, r.name],
    });
    console.log(`sdg_goals: ${n}`);

    n = await insertRows(client, {
      table: 'schemes',
      columns: [
        'id', 'uid', 'gen_sr_no', 'name', 'department_id', 'sub_sector_id', 'status',
        'date_of_approval', 'target_completion_date', 'estimated_cost',
        'physical_progress_pct', 'financial_progress_pct', 'current_fiscal_year', 'revision_flag',
      ],
      rows: schemes, identity: true,
      mapRow: (r) => [
        r.id, r.uid, r.gen_sr_no, r.name, r.department_id, r.sub_sector_id, r.status,
        parseApprovalDate(r.date_of_approval), parseTargetDate(r.target_completion_date), nn(r.estimated_cost),
        nn(r.physical_progress_pct), nn(r.financial_progress_pct), nn(r.current_fiscal_year), nn(r.revision_flag),
      ],
    });
    console.log(`schemes: ${n}`);

    n = await insertRows(client, {
      table: 'scheme_districts', columns: ['scheme_id', 'district_id'], rows: schemeDistricts,
      mapRow: (r) => [r.scheme_id, r.district_id],
    });
    console.log(`scheme_districts: ${n}`);

    n = await insertRows(client, {
      table: 'scheme_funding', columns: ['scheme_id', 'funding_source_id', 'amount'], rows: schemeFunding,
      mapRow: (r) => [r.scheme_id, r.funding_source_id, nn(r.amount)],
    });
    console.log(`scheme_funding: ${n}`);

    n = await insertRows(client, {
      table: 'scheme_sdg', columns: ['scheme_id', 'sdg_id'], rows: schemeSdg,
      mapRow: (r) => [r.scheme_id, r.sdg_id],
    });
    console.log(`scheme_sdg: ${n}`);

    n = await insertRows(client, {
      table: 'revision_history',
      columns: ['scheme_id', 'revised_on', 'capital_at_revision', 'revenue_at_revision', 'total_cost_at_revision'],
      rows: revisionHistory,
      mapRow: (r) => [r.scheme_id, parseRevisionDate(r.revised_on), nn(r.capital_at_revision), nn(r.revenue_at_revision), nn(r.total_cost_at_revision)],
    });
    console.log(`revision_history: ${n}`);

    n = await insertRows(client, {
      table: 'financial_year_allocations',
      columns: [
        'scheme_id', 'fiscal_year', 'revised_allocation_total', 'revised_allocation_fpa',
        'estimated_expenditure', 'throw_forward', 'allocation_capital', 'allocation_revenue',
        'allocation_total', 'allocation_fpa', 'financial_progress_pct_prior_year', 'financial_progress_pct_current_year',
      ],
      rows: financialYearAllocations,
      mapRow: (r) => [
        r.scheme_id, r.fiscal_year, nn(r.revised_allocation_total), nn(r.revised_allocation_fpa),
        nn(r.estimated_expenditure), nn(r.throw_forward), nn(r.allocation_capital), nn(r.allocation_revenue),
        nn(r.allocation_total), nn(r.allocation_fpa), nn(r.financial_progress_pct_prior_year), nn(r.financial_progress_pct_current_year),
      ],
    });
    console.log(`financial_year_allocations: ${n}`);

    console.log('\nResyncing identity sequences...');
    for (const t of ['divisions', 'districts', 'departments', 'sub_sectors', 'funding_sources', 'schemes']) {
      await resyncSequence(client, t);
    }

    await client.query('commit');
    console.log('\n✅ Import committed.');
  } catch (err) {
    await client.query('rollback');
    console.error('\n❌ Import failed, rolled back:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
