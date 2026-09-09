# Schema: Smart Provincial M&E Management Ecosystem

## Scheme reference data + monitoring-app operational data (PostgreSQL / Supabase)

> **This supersedes the earlier `schema.md`.** That version was written against a MongoDB/MERN assumption and covered only the ADP booklet's reference data. The confirmed stack is **PERN** (PostgreSQL via Supabase + Express + React + Node, React Native mobile client), and the app's actual scope covers both the scheme reference data *and* the full RD → DG → MEO monitoring workflow — this document reflects both, in relational form. The executable DDL lives in `app-operational-schema.sql`; this file is its conceptual/ER companion — read this to understand *why* the shape is what it is, read the `.sql` to actually run it.

---

## 1. System context

| | |
|---|---|
| Source of scheme data | Sindh Government ADP (Annual Development Programme) booklet — ~3,700+ schemes across 50 sectors/departments and 6 divisions |
| App scope | Team assembly → DG approval → site visit → form/photos/issues → view access (see `PRD.md`, `phases.md`) |
| **Scheme creation** | **Out of scope.** Schemes enter the database only via a one-time/periodic backend import script against the ADP booklet — there is no in-app "add scheme" path, and no endpoint should exist for it |
| Roles | Regional Director (RD), Director General (DG), MEO (lead — does fieldwork), Support user (view-only) |
| Visibility scoping | RD and DG are scoped to **their own division**, not province-wide; support users are scoped to visits they're a team member of |

---

## 2. Entity overview (ER summary)

```
-- Reference data (seeded once, read-only to the app) --
Division (1) ──< District (1) ──< SchemeDistrict >── (1) Scheme >── (1) SubSector >── (1) Department
Scheme (1) ──< FinancialYearAllocation
Scheme (M) ──< SchemeFunding >── (N) FundingSource
Scheme (M) ──< SchemeSDG >── (N) SDGGoal
Scheme (1) ──< RevisionHistory

-- Operational data (read/write via the app) --
User (M) ── division_id ──> Division
User (M) ── department_id ──> Department          [nullable — only relevant for "other dept worker" members]

VisitTeam (1) ──< VisitTeamMember >── (N) User
VisitTeam (1) ──< TeamApprovalRequest              (one row per submit/reject/resubmit cycle)
VisitTeam (1) ──< SiteVisit                        (created only once status = APPROVED)

SiteVisit (1) ──< VisitForm  ── template_id ──> FormTemplate ──< FormTemplateField
SiteVisit (1) ──< VisitPhoto
SiteVisit (1) ──< IssueReport ──< IssueReportPhoto

Comment      (polymorphic: Scheme | VisitTeam | SiteVisit | IssueReport)
Notification (per User, polymorphic reference to the above)
```

Two families of entities, one database: **reference data** is written once (by an admin import job) and read everywhere; **operational data** is what the app actually creates and mutates turn by turn.

---

## 3. Reference / master data (seeded from the ADP booklet)

These mirror `schema.md`'s original ADP extraction, now in relational form. The app reads these tables constantly (scheme browser, dashboards, financial reconciliation) but **never writes to `schemes` through a user-facing flow.**

| Table | Key fields | Notes |
|---|---|---|
| `divisions` | `id`, `name` | The 6 administrative divisions of Sindh — the unit RD/DG visibility is scoped to |
| `districts` | `id`, `division_id → divisions`, `name` | Many districts per division |
| `departments` | `id`, `code`, `name`, `is_program_pool` | The ~50 ADP sectors; `is_program_pool` flags cross-cutting pools (Matching Allocations, Mega Projects for Karachi City, etc.) that re-group schemes owned by other departments |
| `sub_sectors` | `id`, `department_id → departments`, `name` | Thematic grouping inside a department, e.g. "Water Supply & Sanitation" |
| `schemes` | `id`, `uid` (unique), `gen_sr_no`, `name`, `department_id`, `sub_sector_id`, `status`, `date_of_approval`, `target_completion_date`, `estimated_cost`, `physical_progress_pct`, `financial_progress_pct` | The central reference entity. `uid` (e.g. `AGRAE-PP-16-0003`) is the natural idempotency key for the import script. `physical_progress_pct` is a rollup written by the app from `visit_forms`; `financial_progress_pct` comes from the ADP booklet import, not from the app |
| `scheme_districts` | `scheme_id`, `district_id` | Junction — a scheme can span multiple districts |
| `funding_sources` | `id`, `name`, `type` | GoS, GoP, World Bank, ADB, JICA, AIIB, GCF, IsDB, IDA, Farmer/Beneficiary share |
| `scheme_funding` | `scheme_id`, `funding_source_id`, `amount` | Junction — co-financing breakdown per scheme |
| `sdg_goals` | `id` (1–17), `name` | UN SDG lookup |
| `scheme_sdg` | `scheme_id`, `sdg_id` | Junction — a scheme can carry more than one SDG tag |
| `revision_history` | `id`, `scheme_id`, `revised_on`, `capital_at_revision`, `revenue_at_revision`, `total_cost_at_revision`, `note` | Audit trail of cost revisions as printed in the booklet |
| `financial_year_allocations` | `id`, `scheme_id`, `fiscal_year`, `allocation_capital`, `allocation_revenue`, `allocation_total`, `throw_forward`, `financial_progress_pct` | One row per `(scheme, fiscal_year)` — importing next year's ADP booklet is a pure insert here, never a schema change |

> **Which of these does the app's UI actually need on day one?** Per `phases.md`, Phase 1's scheme browser only needs `schemes`, `departments`, `sub_sectors`, `scheme_districts`, and `divisions`/`districts`. The funding/SDG/revision-history tables exist because the source data has them and Phase 3's "physical vs. financial progress reconciliation" needs `financial_year_allocations` — but they don't need UI surfaces until then.

---

## 4. Operational data (the monitoring workflow)

### 4.1 Users

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (matches Supabase `auth.users.id`) | PK |
| `full_name`, `email`, `phone` | text | |
| `role` | enum: `REGIONAL_DIRECTOR`, `DIRECTOR_GENERAL`, `MEO`, `SUPPORT_USER` | Drives every permission check in the app |
| `division_id` | → `divisions`, required for RD/MEO/DG | The scoping key — an RD or DG only ever sees data where the scheme's division matches this |
| `department_id` | → `departments`, nullable | Set for "other department worker" team members |
| `is_active` | boolean | |

### 4.2 Team assembly & DG approval

| Table | Key fields | Notes |
|---|---|---|
| `visit_teams` | `id`, `scheme_id`, `created_by → users` (the RD), `version`, `status` (`DRAFT`/`PENDING_APPROVAL`/`APPROVED`/`REJECTED`) | `version` increments on every resubmission after a rejection |
| `visit_team_members` | `team_id`, `user_id`, `team_role` (`LEAD_MEO`/`SUPPORT_MEO`/`DEPT_MEMBER`/`RD_OBSERVER`) | Exactly one `LEAD_MEO` per team — enforced by a partial unique index |
| `team_approval_requests` | `id`, `team_id`, `team_version`, `submitted_by → users`, `reviewed_by → users`, `decision` (`PENDING`/`APPROVED`/`REJECTED`), `remarks`, timestamps | **Full audit trail** — one row per submit/reject/resubmit cycle, never overwritten |

### 4.3 Site visits & dynamic sector-aware forms

| Table | Key fields | Notes |
|---|---|---|
| `site_visits` | `id`, `team_id` (must be `APPROVED`), `scheme_id`, `status`, `scheduled_date`, `started_at`, `completed_at` | Created once a team clears DG approval |
| `form_templates` | `id`, `department_id` (nullable = generic), `name`, `version`, `is_active` | Infrastructure/health/education visits need different checklists |
| `form_template_fields` | `id`, `template_id`, `field_key`, `label`, `field_type`, `options` (jsonb), `is_required`, `sort_order` | Defines the dynamic checklist per department, no migration needed to add a field |
| `visit_forms` | `id`, `site_visit_id`, `template_id`, `filled_by → users` (Lead MEO only), `status`, `physical_progress_pct`, `remarks`, `responses` (**jsonb**) | `responses` holds the sector-specific answers keyed by `field_key` — new fields never require a schema change |
| `visit_photos` | `id`, `site_visit_id`, `uploaded_by`, `storage_path` (Supabase Storage), `caption`, `geo_lat`, `geo_lng`, `taken_at` | `geo_lat`/`geo_lng` support Phase 2's geo-tagging |

### 4.4 Issue reporting

| Table | Key fields | Notes |
|---|---|---|
| `issue_reports` | `id`, `site_visit_id`, `reported_by`, `issue_type` (**free text**, not an enum), `severity`, `description`, `status`, `resolved_at` | `issue_type` is text, not an enum, since the real-world category list will grow past whatever's defined at launch |
| `issue_report_photos` | `id`, `issue_report_id`, `storage_path`, `caption` | |

### 4.5 Collaboration

| Table | Key fields | Notes |
|---|---|---|
| `comments` | `id`, `commentable_type` (`SCHEME`/`TEAM`/`SITE_VISIT`/`ISSUE_REPORT`), `commentable_id`, `author_id`, `body` | Polymorphic — one table serves every discussable entity. **Support users cannot post here** — enforced at the RLS/API layer, not by the table shape |
| `notifications` | `id`, `user_id`, `title`, `body`, `related_type`, `related_id`, `is_read` | Powers Phase 2's push/in-app notifications |

---

## 5. How division-scoping and role permissions map onto this schema

- An RD or DG's visible scheme set = `schemes` joined through `scheme_districts → districts` where `districts.division_id = users.division_id`. This is the single filter every scheme/team/visit query for those two roles must carry.
- A support user's visible set = `site_visits` joined through `visit_team_members` where `user_id = auth.uid()` — they see only visits for teams they're actually on, and only in read form (no `INSERT`/`UPDATE` grants on `visit_forms`, `visit_photos`, or `issue_reports`).
- A lead MEO's write access = `visit_forms`/`visit_photos`/`issue_reports` rows where `site_visit_id` belongs to a team where `visit_team_members.user_id = auth.uid() AND team_role = 'LEAD_MEO'`.
- `comments.commentable_type = comment on a support-user-visible entity` is still blocked for that role at the RLS layer — the schema allows it structurally (any `author_id` can post), so this rule is enforced in code/policy, not by a missing column.

---

## 6. Design principles carried forward

1. **Dynamic sector fields without migrations** — `visit_forms.responses` is `jsonb`, driven by `form_template_fields`. Adding a new department's checklist is a data insert, not a schema change.
2. **New fiscal year without migrations** — `financial_year_allocations` is keyed by `(scheme_id, fiscal_year)`; a new ADP booklet year is new rows, never new columns.
3. **No scheme creation, ever, from the app** — enforced both by omission (no create endpoint, no create screen) and by treating `schemes` as reference data owned by the periodic import job, not by any user role.
4. **Every approval/rejection is append-only** — `team_approval_requests` never updates a past decision; a resubmission is a new row against a bumped `visit_teams.version`.

## 7. Recommended indexes

```
schemes:                  { uid } unique
scheme_districts:         { district_id, scheme_id }
users:                    { role }, { division_id }
visit_teams:               { scheme_id }, { status }
visit_team_members:        { user_id }, unique { team_id } where team_role = 'LEAD_MEO'
team_approval_requests:    { team_id, decision }
site_visits:               { team_id }, { scheme_id, status }
visit_forms:               { site_visit_id }, GIN on { responses }
issue_reports:             { site_visit_id }, { status }
comments:                  { commentable_type, commentable_id }
notifications:             { user_id } where is_read = false
```

## 8. Companion documents

- `app-operational-schema.sql` — the executable `CREATE TABLE` statements for everything in §4 (run this against Supabase)
- `PRD.md` — why each of these entities exists, in product terms
- `phases.md` — the order these tables/features get built in
