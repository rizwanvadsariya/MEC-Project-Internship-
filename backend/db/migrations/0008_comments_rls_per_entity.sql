-- ============================================================================
--  0008  Scope `comments` SELECT per commentable entity (Memory.md's noted
--  RLS simplification — comments were open-read to any authenticated user).
--  A comment on a scheme/team/site_visit/issue_report should only be visible
--  to whoever can already see that underlying entity.
-- ============================================================================

-- Reusable "can I see this team" check (division-scoped for RD/DG, or a
-- member) — the same logic visit_teams_select already applies, pulled out so
-- comments can reuse it too instead of duplicating the join.
create or replace function can_view_team(p_team_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select (auth_user_role() in ('REGIONAL_DIRECTOR', 'DIRECTOR_GENERAL') and can_view_scheme(team_scheme_id(p_team_id)))
    or is_member_of_team(p_team_id)
$$;

create or replace function can_view_commentable(p_type commentable_type, p_id text) returns boolean
language sql security definer stable set search_path = public as $$
  select case p_type
    when 'SCHEME' then can_view_scheme(p_id::bigint)
    when 'TEAM' then can_view_team(p_id::uuid)
    when 'SITE_VISIT' then can_view_site_visit(p_id::uuid)
    when 'ISSUE_REPORT' then exists (
      select 1 from issue_reports ir where ir.id = p_id::uuid and can_view_site_visit(ir.site_visit_id)
    )
    else false
  end
$$;

drop policy if exists comments_select on comments;
create policy comments_select on comments for select to authenticated using (
  can_view_commentable(commentable_type, commentable_id)
);
