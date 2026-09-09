-- ============================================================================
--  0001  Reference / master data                                (schema.md §3)
--
--  Seeded once (and periodically re-imported) from the ADP booklet by
--  db/seeds/importAdpBooklet.js. The app NEVER writes `schemes` through a
--  user-facing flow — there is no create endpoint and no create screen.
-- ============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- Shared trigger fn reused by 0002 for the operational tables.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---- divisions — the 6 administrative divisions of Sindh -------------------
create table divisions (
  id         integer generated always as identity primary key,
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- ---- districts — many per division ---------------------------------------
create table districts (
  id          integer generated always as identity primary key,
  division_id integer not null references divisions(id),
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (division_id, name)
);

-- ---- departments — the ~50 ADP sectors --------------------------------------
create table departments (
  id              integer generated always as identity primary key,
  code            text unique,
  name            text not null,
  is_program_pool boolean not null default false,   -- cross-cutting pools (Matching Allocations, Mega Projects, ...)
  created_at      timestamptz not null default now()
);

-- ---- sub_sectors — thematic grouping inside a department ------------------
create table sub_sectors (
  id            integer generated always as identity primary key,
  department_id integer not null references departments(id),
  name          text not null,
  created_at    timestamptz not null default now(),
  unique (department_id, name)
);

-- ---- schemes — the central reference entity ------------------------------
create table schemes (
  id                     bigint generated always as identity primary key,
  uid                    text not null unique,          -- e.g. AGRAE-PP-16-0003 — import idempotency key
  gen_sr_no              text,
  name                   text not null,
  department_id          integer not null references departments(id),
  sub_sector_id          integer references sub_sectors(id),
  status                 text,                          -- ADP-book status; not user-editable
  date_of_approval       date,
  target_completion_date date,
  estimated_cost         numeric(18,2),
  physical_progress_pct  numeric(5,2),                  -- rollup written by the app from visit_forms
  financial_progress_pct numeric(5,2),                  -- from the ADP import, not the app
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create trigger schemes_set_updated_at
  before update on schemes for each row execute function set_updated_at();

-- ---- scheme_districts — junction (a scheme can span districts) ------------
create table scheme_districts (
  scheme_id   bigint  not null references schemes(id) on delete cascade,
  district_id integer not null references districts(id),
  primary key (scheme_id, district_id)
);

-- ---- funding_sources — GoS, GoP, World Bank, ADB, JICA, AIIB, GCF, ... ----
create table funding_sources (
  id   integer generated always as identity primary key,
  name text not null unique,
  type text
);

-- ---- scheme_funding — junction (co-financing breakdown per scheme) -------
create table scheme_funding (
  scheme_id         bigint  not null references schemes(id) on delete cascade,
  funding_source_id integer not null references funding_sources(id),
  amount            numeric(18,2),
  primary key (scheme_id, funding_source_id)
);

-- ---- sdg_goals — UN SDG lookup (1..17) ----------------------------------
create table sdg_goals (
  id   integer primary key check (id between 1 and 17),
  name text not null
);

-- ---- scheme_sdg — junction (a scheme can carry >1 SDG tag) --------------
create table scheme_sdg (
  scheme_id bigint  not null references schemes(id) on delete cascade,
  sdg_id    integer not null references sdg_goals(id),
  primary key (scheme_id, sdg_id)
);

-- ---- revision_history — cost revisions as printed in the booklet --------
create table revision_history (
  id                     bigint generated always as identity primary key,
  scheme_id              bigint not null references schemes(id) on delete cascade,
  revised_on             date,
  capital_at_revision    numeric(18,2),
  revenue_at_revision    numeric(18,2),
  total_cost_at_revision numeric(18,2),
  note                   text,
  created_at             timestamptz not null default now()
);

-- ---- financial_year_allocations — one row per (scheme, fiscal_year) -------
--  Importing next year's ADP booklet is a pure insert here, never a migration.
create table financial_year_allocations (
  id                     bigint generated always as identity primary key,
  scheme_id              bigint not null references schemes(id) on delete cascade,
  fiscal_year            text not null,                 -- e.g. '2026-2027'
  allocation_capital     numeric(18,2),
  allocation_revenue     numeric(18,2),
  allocation_total       numeric(18,2),
  throw_forward          numeric(18,2),
  financial_progress_pct numeric(5,2),
  created_at             timestamptz not null default now(),
  unique (scheme_id, fiscal_year)
);
