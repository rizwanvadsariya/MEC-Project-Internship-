-- ============================================================================
--  0004  Extend reference tables to match the real ADP booklet CSV extract
--
--  adp-database-seed-csv/ (12 files, one per reference table) carries a few
--  columns 0001 didn't anticipate. All three tables are still empty at this
--  point (no operational data depends on them yet), so these are safe,
--  additive changes made right before the one-time import in 0005-equivalent
--  seed script (db/seeds/importAdpBooklet.js).
-- ============================================================================

-- departments: ADP serial-number range and PDF page range per department,
-- carried through from the ledger extraction for provenance/traceability.
alter table departments
  add column adp_no_from integer,
  add column adp_no_to   integer,
  add column scheme_count integer,
  add column page_from   integer,
  add column page_to     integer;

-- schemes: the booklet's own under-revision marker and the fiscal year this
-- extract's progress figures pertain to.
alter table schemes
  add column current_fiscal_year text,
  add column revision_flag      text;

-- target_completion_date in the source is a month+year target (e.g. "Jun-27"),
-- not a calendar date — storing it as `date` would fabricate a day-of-month
-- that isn't in the source. Keep it as the literal printed string.
alter table schemes
  alter column target_completion_date type text using target_completion_date::text;

-- financial_year_allocations: the source distinguishes prior-year vs
-- current-year financial progress and carries revised/estimated figures the
-- original design collapsed into one generic percentage. Replace the single
-- financial_progress_pct with the real columns.
alter table financial_year_allocations
  drop column financial_progress_pct,
  add column revised_allocation_total          numeric(18,2),
  add column revised_allocation_fpa            numeric(18,2),
  add column estimated_expenditure             numeric(18,2),
  add column allocation_fpa                    numeric(18,2),
  add column financial_progress_pct_prior_year   numeric(5,2),
  add column financial_progress_pct_current_year numeric(5,2);
