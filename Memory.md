# Memory.md — Project Status & Context Log

## Smart Provincial M&E Management Ecosystem

**Last updated:** September 11, 2026
**Current stage:** Phase 0 in progress. Monorepo scaffold created; Supabase provisioned and **connected to the backend**; full schema applied; **real ADP booklet data (3,712 schemes) loaded into Supabase**; and **Supabase Auth is now implemented and verified end-to-end** — all 10 hardening points, 4 test accounts (RD/DG/MEO/Support), login/provisioning/deactivation/lockout/sessions/forgot-password all tested live. Next: RLS.

> Repo note: history was rewritten on `Main` (co-author trailers stripped) after PR #1 merged; `Main` is now the repo's only branch — the old `feature/adp-schema-and-monitoring-workflow` branch is deleted. Nothing about that affects project status below.

> This file exists so anyone — a teammate or an AI assistant — picking this project back up can tell exactly where things stand without re-reading the whole planning conversation. Update "Current stage" and "Next steps" as work actually progresses; everything else here is a decision record and should stay historical.

---

## Where we actually are

Per the build sequence in `phases.md`, Phase 0 is underway:

- **Step 1 (schema) — DONE.** All 26 domain tables + `audit_log`, 7 enums, 37 FKs and every index from `schema.md` §7 are applied to the live Supabase project via migrations `0001`–`0003`. Migration `0004` additionally extended `departments`, `schemes`, and `financial_year_allocations` with columns the real ADP CSVs carry that the original design didn't anticipate (see Key decisions #14).
- **Step 2 (ADP import) — DONE.** `backend/db/seeds/importAdpBooklet.js` loaded all 12 reference tables from `adp-database-seed-csv/*.csv` (committed at the repo root): 6 divisions, 30 districts, 50 departments, 112 sub-sectors, 10 funding sources, 17 SDG goals, **3,712 schemes**, 3,730 scheme-district links, 52 funding splits, 873 SDG tags (24 exact-duplicate rows deduped), 313 revision-history rows, 3,712 financial-year-allocation rows. Verified by direct query + spot-checked joins. Re-running the script is safe (it truncates and reloads the 12 reference tables in one transaction).
- **Step 3 (Auth) — DONE.** Full auth stack implemented and verified live — see "Supabase Auth setup" below for the complete breakdown.
- **Step 4 (API skeleton) — PARTIAL.** Monorepo scaffold exists (`backend/`, `mobile/`, `shared/`, `docs/`, `.github/`). Backend boots, connects to Supabase, and serves `GET /api/v1/health` (live DB round-trip). The `auth` slice of routes/controllers/services/repositories/middleware is real; every other resource (schemes, teams, approvals, ...) is still a documented stub.
- **Step 5 (RN app shell) — NOT STARTED.**
- **RLS — deliberately deferred** to a later migration. Auth now resolves `auth.uid()` → `users` role/division (needed for RLS join logic), so this is unblocked, just not yet built. Backend currently connects as the `postgres` pooler role, which bypasses RLS, so the API is the only enforcement layer for now.

## Supabase Auth setup (Phase 0 Step 3) — IMPLEMENTED and verified live

Option A (admin-provisioned accounts, no public Sign Up screen) with all 10 hardening points. Built, migrated to the live Supabase project, and exercised end-to-end against real HTTP requests — not just unit-level. One design point changed from the original plan during implementation (see below), and one real bug was caught and fixed by that testing.

Re-verified independently in a second, later pass (fresh server boot, all 10 points re-tested one at a time against live HTTP) — same results, no new issues. Test data cleaned up after both passes; the 4 seeded accounts are the only rows in `users`.

**Deviation from the original plan:** login **is** a backend route (`POST /api/v1/auth/login`), not a direct Supabase client call as first planned. This had to change to make point #8 (login lockout) possible at all — the backend can't count failed attempts on logins it never sees. The route calls `supabase.auth.signInWithPassword()` server-side (the existing service-role client works fine for this — it's a pure auth-service call, not an RLS-bypass concern) and returns the resulting session to the caller.

**Bug caught during verification:** `z.coerce.boolean()` on `MFA_ENFORCEMENT_ENABLED` turned the *string* `"false"` into `true` (`Boolean("false")` is truthy in JS) — so the flag was permanently stuck on regardless of `.env`, and DG/RD got locked out of `/me` immediately. Fixed with a proper string-aware boolean preprocessor in `config/index.js` (`boolFromEnv`). Worth remembering for any other boolean env var added later — never use bare `z.coerce.boolean()`.

**What's live, per point:**
1. **Invite links** — `provisionUser` calls `supabase.auth.admin.generateLink({ type: 'invite' })`; verified end-to-end (a real Supabase invite `action_link` came back). No SMTP is configured yet, so the link is returned directly to the (already-authorized) caller in the API response instead of emailed — swap that once SMTP is set up. The 4 test accounts remain the documented exception (`admin.createUser` with a known password).
2. **Authorization matrix** — `PROVISION_MATRIX` in `services/auth.service.js`. Verified: RD→DG rejected (`PROVISION_ROLE_DENIED`), RD→MEO same division accepted, RD→MEO different division rejected (`PROVISION_DIVISION_DENIED`), MEO blocked at the route entirely (never reaches the service).
3. **Defense in depth** — `validators/auth.schema.js`'s `provisionUser` schema mirrors the DB's `CHECK (role = 'SUPPORT_USER' OR division_id IS NOT NULL)` via a zod `.refine()`.
4. **Audit logging** — `repositories/auditLog.repo.js` + `audit_log` table. Verified live: every login, provision, deactivate, lockout, and password-reset request in the test run left a matching row (18 rows from one test pass, forming a coherent trail).
5. **Rate limiting** — `provisionLimiter` (`RATE_LIMIT_MAX_PROVISION`, default 5/window) on `POST /auth/users` only, confirmed separate from `loginLimiter` (`RATE_LIMIT_MAX_AUTH`, default 10/window) on login/forgot-password — provisioning calls didn't consume the login bucket and vice versa.
6. **Deactivation with revoke** — `PATCH /auth/users/:id/deactivate` sets `is_active = false`, deletes all rows in `auth.sessions` for that user, and best-effort bans them via `supabase.auth.admin.updateUserById(..., { ban_duration: '876600h' })`. Also added: `login()` itself now checks `is_active` up front (`ACCOUNT_DEACTIVATED`) rather than only failing later at `/me` — a gap in the original plan closed during implementation.
7. **MFA gate for DG/RD** — `authorize.js` checks `req.authClaims.aal === 'aal2'` for `HIGH_VALUE_ROLES`, gated behind `MFA_ENFORCEMENT_ENABLED` (**default `false`** — no mobile enrollment screen exists yet, so turning this on would lock out every DG/RD with no way back in). Explicitly verified both states: flag on → DG blocked (`MFA_REQUIRED`) while MEO still works; flag off (the shipped default) → DG works normally.
8. **Login lockout** — `LOGIN_LOCKOUT_MAX_ATTEMPTS` (default 5) / `LOGIN_LOCKOUT_WINDOW_MINUTES` (default 15), tracked in new `users.failed_login_count`/`locked_until` columns (migration `0005`). Verified: 5 wrong passwords locks the account (423-equivalent `ACCOUNT_LOCKED`, actually returned as 403), and — importantly — the *correct* password is still rejected while locked (the lock check runs before Supabase is even called).
9. **Session visibility + revoke** — `repositories/session.repo.js` reads/deletes directly from Supabase's own `auth.sessions` table (confirmed the `postgres` pooler role can read it, same as `auth.users`). `GET /auth/sessions` / `DELETE /auth/sessions/:id`, scoped to the caller's own sessions. Verified: listed 2 real sessions, revoked 1, list shrank to 1.
10. **Forgot password** — `POST /auth/forgot-password` calls `supabase.auth.resetPasswordForEmail()`; verified a registered and an unregistered email get an **identical** 200 response (no account-enumeration leak), and every request is still audit-logged.

**Files:** `backend/db/migrations/0005_login_lockout_columns.sql`; `middleware/{authenticate,authorize,divisionScope,validate,rateLimit}.js`; `repositories/{user,auditLog,session}.repo.js`; `services/auth.service.js`; `controllers/auth.controller.js`; `api/v1/routes/auth.routes.js` (mounted at `/api/v1/auth`); `validators/auth.schema.js`; `db/seeds/seedTestAccounts.js` (creates `dg.test@mec.local` / `rd.test@mec.local` / `meo.test@mec.local` / `support.test@mec.local` — division 1 = Karachi, department 1 = Agriculture; passwords are random per run, printed once to console, never committed). `constants/roles.js` now also exports `HIGH_VALUE_ROLES`. `lib/ApiError.js` gained an optional machine-readable `code` (e.g. `MFA_REQUIRED`, `ACCOUNT_LOCKED`, `EMAIL_TAKEN`) surfaced by `errorHandler.js`. New `.env` keys: `MFA_ENFORCEMENT_ENABLED`, `LOGIN_LOCKOUT_MAX_ATTEMPTS`, `LOGIN_LOCKOUT_WINDOW_MINUTES`, `INVITE_REDIRECT_URL`, `PASSWORD_RESET_REDIRECT_URL`, `RATE_LIMIT_MAX_PROVISION`.

**Not built:** the mobile MFA-enrollment screen (blocks turning on point #7), real email delivery for invites/resets (no SMTP configured — Supabase's default sending may or may not be sufficient at volume), and a real alert channel for point #8's "notify on DG/RD lockout" (currently just a `LOGIN_LOCKED` audit_log row with `highValueAccount: true` — no email/Slack/push wired up).

## Artifacts produced so far

| File                         | What it is                                                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PRD.md`                     | Full product requirements — problem statement, roles, workflow, permission matrix, phased feature list, non-functional requirements, open questions                                |
| `schema.md`                  | Entity/relationship documentation covering both the ADP booklet reference data and the operational app data, in PostgreSQL/Supabase terms (supersedes an earlier MERN-based draft) |
| `app-operational-schema.sql` | _Superseded_ by the numbered `backend/db/migrations/*` files (see Code artifacts below) — kept only as historical reference if still present                                        |
| `phases.md`                  | Dependency-ordered, 34-step build sequence across Phase 0–4, with a 9-step critical path called out                                                                                |
| `README.md`                  | Project front door — overview, feature summary, tech stack, docs index, generic getting-started scaffold                                                                           |
| `architecture.md`            | Tech stack + backend hardening (security / performance / efficiency); the layered-architecture spec the scaffold follows                                                            |

### Code / infra artifacts (added after planning)

| Artifact | What it is |
| --- | --- |
| Monorepo scaffold | `backend/` (Express, layered `routes→controllers→services→repositories` + `middleware/`, `db/migrations`, `db/seeds`, `tests/`), `mobile/` (React Native + Expo, TS, role-partitioned `screens/`), `shared/` (role/enum constants), `docs/`, `.github/workflows/` (CI). Most files are documented stubs. |
| `backend/src/config/` | Real wiring: `index.js` (env + zod validation, fails fast on placeholders), `database.js` (`pg` pool on the Supabase transaction pooler), `supabase.js` (service-role client). |
| `backend/.env` | Filled with the live project: `SUPABASE_URL` (ref `fcneocvlbgmasatfpvrd`), service-role secret key, JWKS URL, `DATABASE_URL`/`DIRECT_URL` via the Supavisor pooler (`aws-0-ap-northeast-1`, ports 6543 / 5432, password URL-encoded). Git-ignored. |
| `backend/scripts/check-db.js` | `npm run check:db` — Postgres + Supabase Storage connectivity check. Passes. |
| `backend/scripts/migrate.js` | `npm run migrate` / `migrate:status` — applies `db/migrations/*.sql` in order via `DIRECT_URL`, tracks in `schema_migrations`. Migrations are immutable once applied. |
| `backend/db/migrations/0001–0005` | `0001` reference tables, `0002` operational tables + enums + `updated_at` triggers, `0003` indexes, `0004` extends `departments`/`schemes`/`financial_year_allocations` to match the real ADP CSV columns, `0005` adds `users.failed_login_count`/`locked_until` (login lockout). All applied to Supabase. |
| `backend/src/{middleware,repositories,services,controllers,validators}` auth slice | Full Supabase Auth implementation — see "Supabase Auth setup" above. Verified against the live project with real login/provision/deactivate/lockout/session/reset-password calls. |
| `adp-database-seed-csv/` (repo root) | 12 CSVs, one per reference table, exported from the government ADP ledger — the source of truth `importAdpBooklet.js` reads. Committed to the repo (not git-ignored). |
| `backend/db/seeds/importAdpBooklet.js` | `npm run seed:adp` — real implementation (was a stub). Truncates + reloads the 12 reference tables in one transaction, preserves the CSVs' own ids (`OVERRIDING SYSTEM VALUE` + sequence resync), dedupes the 24 exact-duplicate `scheme_sdg` rows. |

Mobile app code and the React Native shell do not exist yet (stubs only).

## Key decisions made (chronological)

1. Tech stack corrected from an initial MERN assumption to **PERN**: PostgreSQL via Supabase, Express.js, React Native (mobile), Node.js — deployment on Vercel (frontend) and Render (backend).
2. App targets the **Sindh Secretariat**, covering schemes across all **6 divisions** of the province.
3. **4 user roles** defined: Regional Director (RD), Director General (DG), MEO (lead — does fieldwork), Support user (strictly view-only).
4. **Core workflow** defined: RD assembles a visit team → DG approves/rejects (revise-and-resubmit loop on rejection) → once approved, the lead MEO visits the site, fills the form, uploads photos, and files issues → the rest of the team gets view-only access.
5. **RD/DG visibility scoped to their own division**, not province-wide.
6. **Support users are strictly view-only** — no commenting, no editing.
7. **Scheme creation is explicitly out of scope.** The app only ever reads/reports against schemes already seeded from the ADP booklet via a one-time backend import script — this triggered a rewrite of `schema.md` and a note in `PRD.md` §3 and §12.
8. Full **4-phase feature roadmap** defined (Core MVP → Usability → Monitoring/Accountability → Advanced Intelligence), then broken into the 34-step dependency-ordered sequence in `phases.md`.
9. **Monorepo layout** chosen: `backend/` (JS), `mobile/` (TS), `shared/`, `docs/`, `.github/`. Backend follows the layered architecture in `architecture.md` §3.
10. **Supabase connection is pooler-only.** New Supabase projects get no `db.<ref>.supabase.co` direct host; both `DATABASE_URL` (6543) and `DIRECT_URL` (5432) go through the Supavisor pooler. This is also the correct setup for Render.
11. **Local backend port is 4000, not 8080** — 8080 is occupied on the dev machine by an unkillable proxy. Changed the default in `backend/.env(.example)`, `mobile/.env.example`, `mobile/app.json`.
12. **`audit_log` table added** beyond `schema.md` (per `architecture.md` §4.8, append-only). **`users.id` FKs to `auth.users(id)`** (standard Supabase pattern) — an auth user must exist before its `users` row.
13. **RLS deferred** to a later migration at the auth step (see "Where we actually are").
14. **Schema extended for the real ADP CSVs (migration `0004`):** `schemes.target_completion_date` changed from `date` to `text` — the source only ever gives a month+year target (e.g. `"Jun-27"`), so storing it as a date would fabricate a day. Added `schemes.current_fiscal_year`/`revision_flag` and `departments.adp_no_from/to`, `scheme_count`, `page_from/to` (booklet provenance). Replaced `financial_year_allocations.financial_progress_pct` with the source's actual `financial_progress_pct_prior_year`/`_current_year` plus `revised_allocation_total`, `revised_allocation_fpa`, `estimated_expenditure`, `allocation_fpa`. Safe because all three tables were still empty when this ran.
15. **Known minor data-quality note (non-blocking):** `departments.scheme_count` (booklet's own claimed count) sums to 3,715 across departments vs. 3,712 actual scheme rows — a small discrepancy in the source ledger, not an import bug (every FK/referential check passed with zero orphans).
16. **Login is a backend route, not a direct Supabase client call** — changed during Auth implementation specifically so failed-login attempts are visible to the backend for lockout tracking (point #8). See "Supabase Auth setup" above.
17. **`z.coerce.boolean()` is unsafe for env vars** — it turns the string `"false"` into `true`. Fixed via a proper string-aware preprocessor (`boolFromEnv` in `config/index.js`); apply the same pattern to any future boolean env var.

## Open / unresolved questions

Carried forward from `PRD.md` §12 — none of these are answered yet:

1. **Scheme master-field editability** — is `schemes` (cost, target completion date, etc.) fully read-only in-app, with corrections only via re-seeding, or does RD/DG get limited edit rights on specific fields? This affects the RLS policy design and should be settled before Phase 1 permissions work starts.
2. **Frontend deployment shape** — does "frontend on Vercel" mean a separate web-based admin dashboard (React, not Native) alongside the mobile app, or a React Native Web build? These imply different codebases and role coverage.
3. **Support-user comment restriction** — confirmed as view-only for now; flagged to revisit once the app is in pilot use.

## Next steps (Phase 0, per `phases.md`)

- [x] Provision the Supabase project
- [x] Apply the full schema to Supabase (migrations `0001`–`0003`: tables, enums, indexes)
- [x] Backend ↔ Supabase connection wired and verified (`npm run check:db`, `/api/v1/health`)
- [x] Express/Node API skeleton scaffolded (layered dirs + working `app.js`/`server.js`/`/health`)
- [x] Write `db/seeds/importAdpBooklet.js` and run the one-time ADP import (all 12 reference tables loaded from `adp-database-seed-csv/`)
- [x] Set up Supabase Auth per the full design in "Supabase Auth setup" above (all 10 hardening points implemented and verified live)
- [ ] Add an RLS-policies migration + tests in `backend/tests/integration/rls/` (now unblocked — auth resolves `auth.uid()` → role/division)
- [ ] Flesh out the remaining backend routes/controllers/services/repositories (start with the scheme browser — auth is done)
- [ ] Build the React Native app shell (navigation, role-based routing, login screen only — no signup screen needed, see decision on Option A)
- [ ] Mobile MFA-enrollment screen — needed before `MFA_ENFORCEMENT_ENABLED` can safely flip to `true`
- [ ] Real email delivery for invite/reset links (SMTP not configured) and a real alert channel for DG/RD lockouts (currently audit_log-only)
- [ ] Housekeeping: two root READMEs still exist (`README.md` monorepo guide + `README (1).md` product front-door) — decide whether to merge
- [ ] Commit + push the ADP import work AND the auth implementation (migrations `0004`/`0005`, `importAdpBooklet.js`, `adp-database-seed-csv/`, the whole auth slice, doc fixes) — not yet committed as of this update

## Team

- Muhammad Mustafa
- Rizwan Vadsariya
