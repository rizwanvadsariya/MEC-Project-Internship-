-- ============================================================================
--  0002  Operational workflow                                   (schema.md §4)
--
--  RD team assembly -> DG approval -> site visit -> form / photos / issues
--  -> comments / notifications.  Row-Level Security policies are a SEPARATE,
--  later migration (added with the auth step — architecture.md §4.2).
-- ============================================================================

-- ---- enums ---------------------------------------------------------------
create type user_role        as enum ('REGIONAL_DIRECTOR', 'DIRECTOR_GENERAL', 'MEO', 'SUPPORT_USER');
create type team_status       as enum ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');
create type team_member_role  as enum ('LEAD_MEO', 'SUPPORT_MEO', 'DEPT_MEMBER', 'RD_OBSERVER');
create type approval_decision as enum ('PENDING', 'APPROVED', 'REJECTED');
create type issue_severity    as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
create type issue_status      as enum ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED');
create type commentable_type  as enum ('SCHEME', 'TEAM', 'SITE_VISIT', 'ISSUE_REPORT');

-- ---- users — mirrors auth.users -------------------------------------------
create table users (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  email         text not null unique,
  phone         text,
  role          user_role not null,
  division_id   integer references divisions(id),     -- scoping key for RD/DG/MEO
  department_id integer references departments(id),   -- set for "other department worker" members
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint users_division_required_for_scoped_roles
    check (role = 'SUPPORT_USER' or division_id is not null)
);
create trigger users_set_updated_at
  before update on users for each row execute function set_updated_at();

-- ---- visit_teams — one per (scheme, assembly attempt); version bumps on resubmit
create table visit_teams (
  id         uuid primary key default gen_random_uuid(),
  scheme_id  bigint not null references schemes(id),
  created_by uuid not null references users(id),       -- the RD
  version    integer not null default 1,
  status     team_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger visit_teams_set_updated_at
  before update on visit_teams for each row execute function set_updated_at();

-- ---- visit_team_members — exactly one LEAD_MEO per team ------------------
create table visit_team_members (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references visit_teams(id) on delete cascade,
  user_id    uuid not null references users(id),
  team_role  team_member_role not null,
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);
create unique index visit_team_members_one_lead_per_team
  on visit_team_members (team_id) where team_role = 'LEAD_MEO';

-- ---- team_approval_requests — APPEND-ONLY audit trail -------------------
--  One row per submit / reject / resubmit cycle. Never updated in place except
--  to record the DG's decision on the still-PENDING row.
create table team_approval_requests (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references visit_teams(id) on delete cascade,
  team_version integer not null,
  submitted_by uuid not null references users(id),
  reviewed_by  uuid references users(id),
  decision     approval_decision not null default 'PENDING',
  remarks      text,
  submitted_at timestamptz not null default now(),
  reviewed_at  timestamptz
);

-- ---- site_visits — created only once a team is APPROVED -----------------
create table site_visits (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references visit_teams(id),
  scheme_id      bigint not null references schemes(id),
  status         text not null default 'SCHEDULED',    -- SCHEDULED | IN_PROGRESS | COMPLETED | CANCELLED
  scheduled_date date,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger site_visits_set_updated_at
  before update on site_visits for each row execute function set_updated_at();

-- ---- form_templates — infra / health / education checklists differ ------
create table form_templates (
  id            uuid primary key default gen_random_uuid(),
  department_id integer references departments(id),     -- null = generic
  name          text not null,
  version       integer not null default 1,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (department_id, name, version)
);

-- ---- form_template_fields — the dynamic checklist; add a field = an insert
create table form_template_fields (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references form_templates(id) on delete cascade,
  field_key   text not null,
  label       text not null,
  field_type  text not null,        -- text | number | boolean | select | multiselect | date | photo
  options     jsonb,
  is_required boolean not null default false,
  sort_order  integer not null default 0,
  unique (template_id, field_key)
);

-- ---- visit_forms — filled by the Lead MEO; responses is schema-free jsonb
create table visit_forms (
  id                    uuid primary key default gen_random_uuid(),
  site_visit_id         uuid not null references site_visits(id) on delete cascade,
  template_id           uuid not null references form_templates(id),
  filled_by             uuid not null references users(id),
  status                text not null default 'DRAFT',   -- DRAFT | SUBMITTED
  physical_progress_pct numeric(5,2),
  remarks               text,
  responses             jsonb not null default '{}'::jsonb,   -- answers keyed by field_key
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger visit_forms_set_updated_at
  before update on visit_forms for each row execute function set_updated_at();

-- ---- visit_photos ------------------------------------------------------------
create table visit_photos (
  id            uuid primary key default gen_random_uuid(),
  site_visit_id uuid not null references site_visits(id) on delete cascade,
  uploaded_by   uuid not null references users(id),
  storage_path  text not null,               -- Supabase Storage object path (private bucket)
  caption       text,
  geo_lat       numeric(9,6),                -- Phase 2 geo-tagging
  geo_lng       numeric(9,6),
  taken_at      timestamptz,
  created_at    timestamptz not null default now()
);

-- ---- issue_reports — issue_type is free text by design (schema.md §4.4) --
create table issue_reports (
  id            uuid primary key default gen_random_uuid(),
  site_visit_id uuid not null references site_visits(id) on delete cascade,
  reported_by   uuid not null references users(id),
  issue_type    text not null,
  severity      issue_severity not null,
  description   text not null,
  status        issue_status not null default 'OPEN',
  resolved_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger issue_reports_set_updated_at
  before update on issue_reports for each row execute function set_updated_at();

-- ---- issue_report_photos --------------------------------------------------
create table issue_report_photos (
  id              uuid primary key default gen_random_uuid(),
  issue_report_id uuid not null references issue_reports(id) on delete cascade,
  storage_path    text not null,
  caption         text,
  created_at      timestamptz not null default now()
);

-- ---- comments — polymorphic; support users blocked at the RLS/API layer --
create table comments (
  id               uuid primary key default gen_random_uuid(),
  commentable_type commentable_type not null,
  commentable_id   text not null,          -- scheme ids are bigint, others uuid — stored as text
  author_id        uuid not null references users(id),
  body             text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger comments_set_updated_at
  before update on comments for each row execute function set_updated_at();

-- ---- notifications — powers Phase 2 push / in-app notifications ----------
create table notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  title        text not null,
  body         text,
  related_type text,
  related_id   text,
  is_read      boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ---- audit_log — general append-only trail (architecture.md §4.8) -------
create table audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references users(id),
  action      text not null,
  entity_type text,
  entity_id   text,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
