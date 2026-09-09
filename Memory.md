# Memory.md — Project Status & Context Log

## Smart Provincial M&E Management Ecosystem

**Last updated:** September 10, 2026
**Current stage:** Phase 0 in progress. Monorepo scaffold created; Supabase provisioned and **connected to the backend**; the full database schema (all tables, enums, indexes) is **applied to Supabase**. Next: Auth + RLS, then the ADP import.

> This file exists so anyone — a teammate or an AI assistant — picking this project back up can tell exactly where things stand without re-reading the whole planning conversation. Update "Current stage" and "Next steps" as work actually progresses; everything else here is a decision record and should stay historical.

---

## Where we actually are

Per the build sequence in `phases.md`, Phase 0 is underway:

- **Step 1 (schema) — DONE.** All 26 domain tables + `audit_log`, 7 enums, 37 FKs and every index from `schema.md` §7 are applied to the live Supabase project via migrations `0001`–`0003`. Verified by direct query.
- **Step 4 (API skeleton) — PARTIAL.** Monorepo scaffold exists (`backend/`, `mobile/`, `shared/`, `docs/`, `.github/`). Backend boots, connects to Supabase, and serves `GET /api/v1/health` (live DB round-trip). Layered dirs (routes/controllers/services/repositories/middleware) are stubs.
- **Steps 2 (ADP import), 3 (Auth + roles), 5 (RN app shell) — NOT STARTED.**
- **RLS — deliberately deferred** to a `0004` migration alongside the auth step (policies need `auth.uid()` → `users` role/division resolution). Backend currently connects as the `postgres` pooler role, which bypasses RLS, so the API is the only enforcement layer for now.

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
| `backend/db/migrations/0001–0003` | `0001` reference tables, `0002` operational tables + enums + `updated_at` triggers, `0003` indexes. All applied to Supabase. |

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
13. **RLS deferred** to migration `0004` at the auth step (see "Where we actually are").

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
- [ ] Write `db/seeds/importAdpBooklet.js` and run the one-time ADP import (`departments`, `sub_sectors`, `districts`, `divisions`, `schemes`, funding/SDG/financial-year rows)
- [ ] Set up Supabase Auth, seed one test account per role (`seedTestAccounts.js`), populate the `users` mirror table
- [ ] Add migration `0004_rls_policies.sql` + tests in `backend/tests/integration/rls/`
- [ ] Flesh out the backend routes/controllers/services/repositories (start with auth + scheme browser)
- [ ] Build the React Native app shell (navigation, role-based routing, login screen)
- [ ] Housekeeping: two root READMEs exist (`README.md` monorepo guide + `README (1).md` product front-door) — decide whether to merge; old MERN files still show as deleted in git and need committing

## Team

- Muhammad Mustafa
- Rizwan Vadsariya
