-- ============================================================================
--  0003  Indexes                                                (schema.md §7)
--
--  Applied up front, not reactively — with 3,700+ schemes and growing visit /
--  photo / issue volume, a missing FK index on a division-scope filter is the
--  most likely first performance bug (architecture.md §5.1).
-- ============================================================================

-- schemes.uid: unique index already created in 0001.

-- Reference-data joins used by the scheme browser
create index scheme_districts_district_scheme_idx on scheme_districts (district_id, scheme_id);
create index schemes_department_idx               on schemes (department_id);
create index schemes_sub_sector_idx               on schemes (sub_sector_id);
create index financial_year_allocations_scheme_idx on financial_year_allocations (scheme_id);

-- Users / division scoping
create index users_role_idx     on users (role);
create index users_division_idx on users (division_id);

-- Team assembly & approval
create index visit_teams_scheme_idx                 on visit_teams (scheme_id);
create index visit_teams_status_idx                 on visit_teams (status);
create index visit_team_members_user_idx            on visit_team_members (user_id);
create index team_approval_requests_team_decision_idx on team_approval_requests (team_id, decision);
-- one-LEAD_MEO-per-team partial unique index: created in 0002.

-- Site visits, forms
create index site_visits_team_idx          on site_visits (team_id);
create index site_visits_scheme_status_idx on site_visits (scheme_id, status);
create index visit_forms_site_visit_idx    on visit_forms (site_visit_id);
create index visit_forms_responses_gin     on visit_forms using gin (responses);

-- Issues
create index issue_reports_site_visit_idx on issue_reports (site_visit_id);
create index issue_reports_status_idx     on issue_reports (status);

-- Collaboration
create index comments_commentable_idx  on comments (commentable_type, commentable_id);
create index notifications_unread_idx  on notifications (user_id) where is_read = false;

-- Audit
create index audit_log_entity_idx on audit_log (entity_type, entity_id);
