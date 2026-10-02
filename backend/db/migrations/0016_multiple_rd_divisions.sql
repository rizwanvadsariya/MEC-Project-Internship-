-- Allow a regional director to be assigned to more than one division while
-- keeping division_id as the legacy/default division for existing consumers.
alter table users
  add column if not exists division_ids integer[];

update users
set division_ids = array[division_id]
where division_ids is null and division_id is not null;

alter table users
  alter column division_ids set default '{}';

update users
set division_ids = '{}'
where division_ids is null;

alter table users
  alter column division_ids set not null;

create index if not exists users_division_ids_gin_idx on users using gin (division_ids);