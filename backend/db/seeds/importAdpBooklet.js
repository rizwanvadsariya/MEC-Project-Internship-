/**
 * One-time / periodic ADP booklet import (phases.md Step 2). Parses the official
 * ADP Volume ledger and upserts divisions, districts, departments, sub_sectors,
 * schemes, scheme_districts, funding + SDG junctions, revision_history and
 * financial_year_allocations. Idempotent on schemes.uid. This is the ONLY way
 * scheme data enters the system — there is no in-app create path.
 *
 * Usage: node db/seeds/importAdpBooklet.js --file ./db/seeds/adp/<ledger>.json
 */
'use strict';
