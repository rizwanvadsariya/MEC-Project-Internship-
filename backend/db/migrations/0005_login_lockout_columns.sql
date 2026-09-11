-- ============================================================================
--  0005  Login-lockout tracking columns (Auth hardening plan, point #8)
--
--  Login is brokered through the backend (services/auth.service.js) rather
--  than called directly from the client, specifically so failed attempts can
--  be counted and locked out here — Supabase Auth itself has no per-account
--  lockout concept the backend can hook into.
-- ============================================================================

alter table users
  add column failed_login_count integer not null default 0,
  add column locked_until       timestamptz;

create index users_locked_until_idx on users (locked_until) where locked_until is not null;
