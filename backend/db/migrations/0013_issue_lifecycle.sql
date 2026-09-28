-- ============================================================================
--  0013  Issue lifecycle tracking: owner + due date               (phases.md Step 24)
--
--  issue_reports.status already had the full OPEN -> ACKNOWLEDGED ->
--  IN_PROGRESS -> RESOLVED enum since migration 0002 (issue_status), but
--  nothing ever advanced it past its OPEN default, and there was no owner or
--  due date to assign. This migration adds the missing columns and the write
--  policy for the role that actually manages resolution.
--
--  Design decision (see Memory.md "Step 24" for the full rationale): lifecycle
--  writes (status transitions, owner assignment, due date) are RD-only, not
--  RD/DG — mirrors Step 21's "RD / lead MEO can schedule, DG cannot" split.
--  The RD is the division's operational manager who assigns fieldwork and
--  chases it to resolution; the DG's role stays oversight/approval, same as
--  everywhere else in this app. DG keeps full read access via the existing
--  issue_reports_select policy (can_view_site_visit already covers RD/DG).
-- ============================================================================

alter table issue_reports
  add column owner_id        uuid references users(id),
  add column due_date        date,
  add column acknowledged_at timestamptz,
  add column in_progress_at  timestamptz;

create index issue_reports_owner_id_idx on issue_reports (owner_id);
create index issue_reports_status_due_date_idx on issue_reports (status, due_date);

-- SECURITY DEFINER helper, same reasoning as is_lead_meo_for_site_visit in
-- migration 0006 (decision #20: cross-table RLS checks must go through a
-- SECURITY DEFINER function, never a raw subquery on another RLS-protected
-- table, to avoid recursion).
create or replace function is_rd_for_site_visit(p_site_visit_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select auth_user_role() = 'REGIONAL_DIRECTOR' and exists (
    select 1 from site_visits sv
    join scheme_districts sd on sd.scheme_id = sv.scheme_id
    join districts d on d.id = sd.district_id
    where sv.id = p_site_visit_id and d.division_id = auth_user_division_id()
  )
$$;

-- Additional permissive UPDATE policy alongside the existing lead-MEO-only
-- issue_reports_write policy (migration 0006) — Postgres OR's multiple
-- permissive policies together, so this only ever widens who may write, never
-- narrows the lead MEO's own pre-submit edit rights. Column-level limits
-- (an RD may only touch status/owner_id/due_date, never issue_type/severity/
-- description) are enforced in issue.service.js, same defense-in-depth split
-- as everywhere else in this app (architecture.md §2) — RLS gates the table,
-- the service layer gates the columns.
create policy issue_reports_lifecycle_update on issue_reports for update to authenticated
  using (is_rd_for_site_visit(site_visit_id))
  with check (is_rd_for_site_visit(site_visit_id));
