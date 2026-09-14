-- ============================================================================
--  0007  Fix infinite RLS recursion between visit_teams / visit_team_members
--
--  0006's visit_teams_select policy queried visit_team_members directly, and
--  visit_team_members_select queried visit_teams directly — each subquery is
--  itself subject to RLS, so evaluating one re-triggered the other in a loop
--  ("infinite recursion detected in policy for relation visit_teams", caught
--  by the RLS test suite). Fix: route every cross-table check through
--  SECURITY DEFINER helper functions, which read the table as the function
--  owner (bypassing RLS) instead of re-entering the caller's own policies.
-- ============================================================================

create or replace function is_member_of_team(p_team_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from visit_team_members where team_id = p_team_id and user_id = auth.uid())
$$;

create or replace function is_lead_meo_of_team(p_team_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from visit_team_members where team_id = p_team_id and user_id = auth.uid() and team_role = 'LEAD_MEO')
$$;

create or replace function team_scheme_id(p_team_id uuid) returns bigint
language sql security definer stable set search_path = public as $$
  select scheme_id from visit_teams where id = p_team_id
$$;

create or replace function team_created_by(p_team_id uuid) returns uuid
language sql security definer stable set search_path = public as $$
  select created_by from visit_teams where id = p_team_id
$$;

-- ---- visit_teams: no more direct reference to visit_team_members ----------
drop policy if exists visit_teams_select on visit_teams;
create policy visit_teams_select on visit_teams for select to authenticated using (
  (auth_user_role() in ('REGIONAL_DIRECTOR', 'DIRECTOR_GENERAL') and can_view_scheme(scheme_id))
  or is_member_of_team(id)
);

-- ---- visit_team_members: no more direct reference to visit_teams ----------
drop policy if exists visit_team_members_select on visit_team_members;
create policy visit_team_members_select on visit_team_members for select to authenticated using (
  user_id = auth.uid()
  or (auth_user_role() in ('REGIONAL_DIRECTOR', 'DIRECTOR_GENERAL') and can_view_scheme(team_scheme_id(team_id)))
  or team_created_by(team_id) = auth.uid()
);

drop policy if exists visit_team_members_write on visit_team_members;
create policy visit_team_members_write on visit_team_members for all to authenticated
  using (team_created_by(team_id) = auth.uid() and auth_user_role() = 'REGIONAL_DIRECTOR')
  with check (team_created_by(team_id) = auth.uid() and auth_user_role() = 'REGIONAL_DIRECTOR');

-- ---- team_approval_requests: same helper, tidier than the join subquery ---
drop policy if exists tar_select on team_approval_requests;
create policy tar_select on team_approval_requests for select to authenticated using (
  submitted_by = auth.uid()
  or (auth_user_role() = 'DIRECTOR_GENERAL' and can_view_scheme(team_scheme_id(team_id)))
);

drop policy if exists tar_update on team_approval_requests;
create policy tar_update on team_approval_requests for update to authenticated using (
  auth_user_role() = 'DIRECTOR_GENERAL' and can_view_scheme(team_scheme_id(team_id))
);

-- ---- site_visits: replace the direct visit_team_members subquery too, for
-- consistency and to avoid relying on the one-sided fix above ---------------
drop policy if exists site_visits_select on site_visits;
create policy site_visits_select on site_visits for select to authenticated using (
  (auth_user_role() in ('REGIONAL_DIRECTOR', 'DIRECTOR_GENERAL') and can_view_scheme(scheme_id))
  or is_member_of_team(team_id)
);

drop policy if exists site_visits_update_lead_meo on site_visits;
create policy site_visits_update_lead_meo on site_visits for update to authenticated
  using (is_lead_meo_of_team(team_id))
  with check (is_lead_meo_of_team(team_id));
