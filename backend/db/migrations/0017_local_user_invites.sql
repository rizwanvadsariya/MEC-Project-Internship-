create table user_invites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index user_invites_user_idx on user_invites (user_id);
create index user_invites_active_idx on user_invites (token_hash) where used_at is null;