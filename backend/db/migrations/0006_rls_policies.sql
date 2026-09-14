-- ============================================================================
--  0006  Row-Level Security policies, scoped by division              (schema.md §5)
--
--  RLS is already enabled on all 27 tables (verified: relrowsecurity = true
--  everywhere before this migration), with zero policies — meaning every
--  table is currently fully deny-all for `authenticated`/`anon` and only
--  reachable via the backend's RLS-bypassing `postgres` connection. This
--  migration adds the actual policies, so RLS becomes a real *second*,
--  independent enforcement layer (architecture.md §4.2) rather than a
--  blanket lock the app happens to tunnel under.
--
--  `anon` gets no policies at all anywhere — this app has no unauthenticated
--  use case, so `anon` stays fully locked out by design, and its default
--  table grants are revoked below as defense in depth (they're currently
--  inert under RLS, but there's no reason to leave them sitting there).
-- ============================================================================

revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Helper functions. SECURITY DEFINER so they read `users` as the function
-- owner (bypassing RLS) rather than recursing through the caller's own
-- policies — the standard Supabase pattern for "who am I" lookups.
-- ---------------------------------------------------------------------------

create or replace function auth_user_role() returns user_role
language sql security definer stable set search_path = public as $$
  select role from users where id = auth.uid()
$$;

create or replace function auth_user_division_id() returns integer
language sql security definer stable set search_path = public as $$
  select division_id from users where id = auth.uid()
$$;

-- A scheme is visible if it's in the caller's own division, or the caller is
-- a SUPPORT_USER (per PRD §7 they browse schemes read-only, but schema.md's
-- division join only defines RD/DG/MEO scoping — SUPPORT_USER.division_id can
-- legitimately be null, so they're given open scheme browse instead of being
-- scoped to nothing; noted as a pragmatic call in Memory.md).
create or replace function can_view_scheme(p_scheme_id bigint) returns boolean
language sql security definer stable set search_path = public as $$
  select auth_user_role() = 'SUPPORT_USER'
    or exists (
      select 1 from scheme_districts sd
      join districts d on d.id = sd.district_id
      where sd.scheme_id = p_scheme_id and d.division_id = auth_user_division_id()
    )
$$;

-- A site visit is visible to RD/DG within its scheme's division, or to any
-- member of its team (schema.md §5: "a support user's visible set = site
-- visits joined through visit_team_members where user_id = auth.uid()").
create or replace function can_view_site_visit(p_site_visit_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from site_visits sv
    where sv.id = p_site_visit_id and (
      (auth_user_role() in ('REGIONAL_DIRECTOR', 'DIRECTOR_GENERAL') and can_view_scheme(sv.scheme_id))
      or exists (select 1 from visit_team_members vtm where vtm.team_id = sv.team_id and vtm.user_id = auth.uid())
    )
  )
$$;

-- Write access to a visit's form/photos/issues = the LEAD_MEO of its team
-- (schema.md §5: "a lead MEO's write access ... where team_role = 'LEAD_MEO'").
create or replace function is_lead_meo_for_site_visit(p_site_visit_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from site_visits sv
    join visit_team_members vtm on vtm.team_id = sv.team_id
    where sv.id = p_site_visit_id and vtm.user_id = auth.uid() and vtm.team_role = 'LEAD_MEO'
  )
$$;

-- ---------------------------------------------------------------------------
-- Reference data: open read for any authenticated user (non-sensitive
-- lookups), never writable through RLS — import stays a `postgres`-only path.
-- ---------------------------------------------------------------------------

create policy divisions_select on divisions for select to authenticated using (true);
create policy districts_select on districts for select to authenticated using (true);
create policy departments_select on departments for select to authenticated using (true);
create policy sub_sectors_select on sub_sectors for select to authenticated using (true);
create policy funding_sources_select on funding_sources for select to authenticated using (true);
create policy sdg_goals_select on sdg_goals for select to authenticated using (true);
create policy form_templates_select on form_templates for select to authenticated using (true);
create policy form_template_fields_select on form_template_fields for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Schemes + everything keyed off a scheme: same division-scoped visibility.
-- ---------------------------------------------------------------------------

create policy schemes_select on schemes for select to authenticated using (can_view_scheme(id));
create policy scheme_districts_select on scheme_districts for select to authenticated using (can_view_scheme(scheme_id));
create policy scheme_funding_select on scheme_funding for select to authenticated using (can_view_scheme(scheme_id));
create policy scheme_sdg_select on scheme_sdg for select to authenticated using (can_view_scheme(scheme_id));
create policy revision_history_select on revision_history for select to authenticated using (can_view_scheme(scheme_id));
create policy financial_year_allocations_select on financial_year_allocations for select to authenticated using (can_view_scheme(scheme_id));

-- ---------------------------------------------------------------------------
-- users — see your own row, or (RD/DG) anyone in your own division.
-- No insert/update/delete: provisioning and deactivation are backend-only
-- (services/auth.service.js, connected as `postgres`).
-- ---------------------------------------------------------------------------

create policy users_select on users for select to authenticated using (
  id = auth.uid()
  or (auth_user_role() in ('REGIONAL_DIRECTOR', 'DIRECTOR_GENERAL') and division_id = auth_user_division_id())
);

-- ---------------------------------------------------------------------------
-- visit_teams / visit_team_members — RD assembles/edits within their own
-- division; RD/DG have full visibility within their division regardless of
-- team membership; MEO/Support see teams they're a member of.
-- ---------------------------------------------------------------------------

create policy visit_teams_select on visit_teams for select to authenticated using (
  (auth_user_role() in ('REGIONAL_DIRECTOR', 'DIRECTOR_GENERAL') and can_view_scheme(scheme_id))
  or exists (select 1 from visit_team_members vtm where vtm.team_id = visit_teams.id and vtm.user_id = auth.uid())
);

create policy visit_teams_insert on visit_teams for insert to authenticated with check (
  auth_user_role() = 'REGIONAL_DIRECTOR' and created_by = auth.uid() and can_view_scheme(scheme_id)
);

create policy visit_teams_update on visit_teams for update to authenticated
  using (auth_user_role() = 'REGIONAL_DIRECTOR' and created_by = auth.uid())
  with check (auth_user_role() = 'REGIONAL_DIRECTOR' and created_by = auth.uid());

create policy visit_team_members_select on visit_team_members for select to authenticated using (
  user_id = auth.uid()
  or exists (
    select 1 from visit_teams vt where vt.id = team_id
    and ((auth_user_role() in ('REGIONAL_DIRECTOR', 'DIRECTOR_GENERAL') and can_view_scheme(vt.scheme_id)) or vt.created_by = auth.uid())
  )
);

create policy visit_team_members_write on visit_team_members for all to authenticated
  using (exists (select 1 from visit_teams vt where vt.id = team_id and vt.created_by = auth.uid() and auth_user_role() = 'REGIONAL_DIRECTOR'))
  with check (exists (select 1 from visit_teams vt where vt.id = team_id and vt.created_by = auth.uid() and auth_user_role() = 'REGIONAL_DIRECTOR'));

-- ---------------------------------------------------------------------------
-- team_approval_requests — the RD who submitted it, or the DG of that
-- scheme's division. Append-only by design: no delete policy at all.
-- ---------------------------------------------------------------------------

create policy tar_select on team_approval_requests for select to authenticated using (
  submitted_by = auth.uid()
  or (auth_user_role() = 'DIRECTOR_GENERAL' and exists (
    select 1 from visit_teams vt where vt.id = team_id and can_view_scheme(vt.scheme_id)
  ))
);

create policy tar_insert on team_approval_requests for insert to authenticated with check (
  auth_user_role() = 'REGIONAL_DIRECTOR' and submitted_by = auth.uid()
);

create policy tar_update on team_approval_requests for update to authenticated using (
  auth_user_role() = 'DIRECTOR_GENERAL' and exists (
    select 1 from visit_teams vt where vt.id = team_id and can_view_scheme(vt.scheme_id)
  )
);

-- ---------------------------------------------------------------------------
-- site_visits — division-scoped for RD/DG, team-membership-scoped otherwise;
-- the LEAD_MEO can update their own visit's status/timestamps (check-in etc).
-- ---------------------------------------------------------------------------

create policy site_visits_select on site_visits for select to authenticated using (
  (auth_user_role() in ('REGIONAL_DIRECTOR', 'DIRECTOR_GENERAL') and can_view_scheme(scheme_id))
  or exists (select 1 from visit_team_members vtm where vtm.team_id = site_visits.team_id and vtm.user_id = auth.uid())
);

create policy site_visits_update_lead_meo on site_visits for update to authenticated
  using (exists (select 1 from visit_team_members vtm where vtm.team_id = site_visits.team_id and vtm.user_id = auth.uid() and vtm.team_role = 'LEAD_MEO'))
  with check (exists (select 1 from visit_team_members vtm where vtm.team_id = site_visits.team_id and vtm.user_id = auth.uid() and vtm.team_role = 'LEAD_MEO'));

-- ---------------------------------------------------------------------------
-- visit_forms / visit_photos / issue_reports / issue_report_photos —
-- read = can_view_site_visit; write = the LEAD_MEO of that visit's team only.
-- ---------------------------------------------------------------------------

create policy visit_forms_select on visit_forms for select to authenticated using (can_view_site_visit(site_visit_id));
create policy visit_forms_write on visit_forms for all to authenticated
  using (is_lead_meo_for_site_visit(site_visit_id))
  with check (is_lead_meo_for_site_visit(site_visit_id));

create policy visit_photos_select on visit_photos for select to authenticated using (can_view_site_visit(site_visit_id));
create policy visit_photos_write on visit_photos for all to authenticated
  using (is_lead_meo_for_site_visit(site_visit_id))
  with check (is_lead_meo_for_site_visit(site_visit_id));

create policy issue_reports_select on issue_reports for select to authenticated using (can_view_site_visit(site_visit_id));
create policy issue_reports_write on issue_reports for all to authenticated
  using (is_lead_meo_for_site_visit(site_visit_id))
  with check (is_lead_meo_for_site_visit(site_visit_id));

create policy issue_report_photos_select on issue_report_photos for select to authenticated using (
  exists (select 1 from issue_reports ir where ir.id = issue_report_id and can_view_site_visit(ir.site_visit_id))
);
create policy issue_report_photos_write on issue_report_photos for all to authenticated
  using (exists (select 1 from issue_reports ir where ir.id = issue_report_id and is_lead_meo_for_site_visit(ir.site_visit_id)))
  with check (exists (select 1 from issue_reports ir where ir.id = issue_report_id and is_lead_meo_for_site_visit(ir.site_visit_id)));

-- ---------------------------------------------------------------------------
-- comments — polymorphic; read is open among staff for MVP (tightening this
-- to per-entity visibility needs a per-commentable_type join and is deferred,
-- see Memory.md). SUPPORT_USER is blocked from posting (schema.md §4.5 /
-- PRD §7) — enforced here as well as at the API layer.
-- ---------------------------------------------------------------------------

create policy comments_select on comments for select to authenticated using (true);
create policy comments_insert on comments for insert to authenticated with check (
  auth_user_role() != 'SUPPORT_USER' and author_id = auth.uid()
);
create policy comments_update on comments for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy comments_delete on comments for delete to authenticated using (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- notifications — strictly your own; created only by the backend (`postgres`).
-- ---------------------------------------------------------------------------

create policy notifications_select on notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit_log, schema_migrations: no policies — stay fully deny-all for
-- authenticated/anon by design; both are backend-internal (`postgres`-only).
