-- ============================================================================
--  0012  Push notification device tokens                        (phases.md Step 17)
--
--  One row per (user, device). A device re-registering (app reinstall, token
--  refresh) upserts by the unique `token` itself, not by user_id — Expo can
--  issue the same token to a re-installed app under the same device/account,
--  and the app always calls the register endpoint on launch, so upsert is
--  the correct steady-state behaviour rather than insert-or-fail.
-- ============================================================================

create table push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  token      text not null unique,
  platform   text not null,        -- ios | android
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_id_idx on push_tokens (user_id);
create trigger push_tokens_set_updated_at
  before update on push_tokens for each row execute function set_updated_at();

-- Same defense-in-depth stance as migration 0006: the app always connects as
-- `postgres` (architecture.md §2), so these policies are never actually
-- exercised by the mobile client, but a table created after 0006's blanket
-- `revoke all ... from anon` needs its own explicit revoke.
alter table push_tokens enable row level security;
revoke all on push_tokens from anon;

create policy push_tokens_select on push_tokens for select to authenticated using (user_id = auth.uid());
create policy push_tokens_insert on push_tokens for insert to authenticated with check (user_id = auth.uid());
create policy push_tokens_update on push_tokens for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_tokens_delete on push_tokens for delete to authenticated using (user_id = auth.uid());
