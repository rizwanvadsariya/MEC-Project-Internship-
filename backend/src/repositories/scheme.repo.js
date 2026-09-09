/**
 * schemes + scheme_districts + financial_year_allocations + revision_history reads.
 * The ONLY layer that talks to Postgres/Supabase. Parameterized queries, proper
 * joins (no N+1), cursor pagination on lists (architecture.md §5.1/§5.3).
 */
'use strict';
module.exports = {};
