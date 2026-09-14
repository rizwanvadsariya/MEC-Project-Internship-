# Smart Provincial M&E Management Ecosystem

Mobile-first monitoring platform for the Sindh Secretariat: a Regional Director
assembles a field team, a Director General approves it, the assigned MEO
visits the scheme site and files photos + a progress form + any issues, and
the whole record is visible (read-only) to the rest of the team and to
leadership within that division.

Scheme progress today is tracked manually — paper reports, phone calls,
disconnected spreadsheets — with no reliable way to verify claimed physical
progress against the ADP booklet's own figures, and no structured trail of who
is authorized to visit and report on a scheme. This app replaces that with one
workflow, one live record per scheme, and a clear audit trail for every
approval.

**Current build status lives in [`Memory.md`](./Memory.md)** — read that first
for what's actually built vs. planned; this file stays a stable front door.

## Key features (MVP)

- Role-based login (admin-provisioned accounts — no self-service signup)
- Read-only scheme browser — search/filter by division, district, department,
  sub-sector, status
- Regional Director team assembly (lead MEO + supporting MEOs + other-department
  staff, RD optional)
- Director General approval queue, with a revise-and-resubmit loop on rejection
- Site-visit creation, auto-enabled once a team is approved
- Sector-aware visit form (infrastructure/health/education/etc. have different
  checklist fields) with physical progress %
- Photo capture and upload per visit
- Issue reporting (type, severity, description)
- Division-scoped dashboards for RD/DG; strict view-only access for support users

The full phase-by-phase roadmap (notifications, offline mode, GIS maps,
predictive risk flagging, and everything past MVP) is in [`phases.md`](./phases.md).

> **Explicitly out of scope:** there is no "create/add a scheme" feature
> anywhere in this app. Scheme data is seeded once from the official ADP
> booklet via a backend import script — the app only ever reads and reports
> against schemes that already exist.

## User roles

| Role                       | Access                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| **Regional Director (RD)** | Assembles visit teams, submits for DG approval, full visibility within their own division |
| **Director General (DG)**  | Approves/rejects proposed teams, full visibility within their own division                |
| **MEO (lead)**             | Visits the site, fills the form, uploads photos, files issues                             |
| **Support user**           | Strictly view-only — sees the form, photos, and issues for visits they're assigned to     |

Full permission matrix in [`PRD.md`](./PRD.md#7-role--permission-matrix).

## How it works

```
RD builds team → DG reviews → (rejected → RD revises & resubmits) → approved
   → Lead MEO visits site: photos + form + issue report
      → Rest of team (view-only) + RD/DG (own division) can see the record
```

See [`PRD.md`](./PRD.md) §6 for the detailed workflow write-up.

## Repository layout

```
backend/    Express API (PERN). Layered routes -> controllers -> services -> repositories.
            Also: db/migrations (schema + RLS), db/seeds (ADP import), tests.
mobile/     React Native (Expo, TS) client for all four roles.
shared/     Constants shared by both (role names, enums) to avoid drift.
docs/       Index into the planning docs at the repo root.
.github/    CI: lint + typecheck + tests gate every deploy.
```

Each package has its own README with the folder-by-folder breakdown:
[`backend/README.md`](./backend/README.md) · [`mobile/README.md`](./mobile/README.md).

## Tech stack (PERN)

| Layer                     | Choice                                                       |
| ------------------------- | ------------------------------------------------------------ |
| Database / Auth / Storage | PostgreSQL, Auth, Storage — [Supabase](https://supabase.com) |
| Backend API               | Node.js + Express.js (hosted on Render)                      |
| Mobile client             | React Native + Expo (TypeScript)                             |
| Frontend hosting          | Vercel                                                       |

## Getting started

```bash
# 1. Backend
cd backend && cp .env.example .env   # fill Supabase URL + service role key + DATABASE_URL
npm install && npm run migrate
npm run seed:adp                     # loads adp-database-seed-csv/*.csv at the repo root
npm run seed:accounts                # creates the 4 test accounts (RD/DG/MEO/Support)
npm run dev

# 2. Mobile (separate terminal)
cd mobile && npm install
API_BASE_URL=http://<your-LAN-IP>:4000/api/v1 npx expo start
# Expo Go -> "Enter URL manually" -> exp://<your-LAN-IP>:8081
```

See [`backend/README.md`](./backend/README.md#connecting-supabase) for the full
Supabase connection walkthrough, and [`mobile/README.md`](./mobile/README.md)
for finding your machine's LAN IP.

### Environment variables

| Variable                      | Used by      | Purpose                                                                                       |
| ----------------------------- | ------------ | --------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`                | Backend      | Supabase project URL                                                                          |
| `SUPABASE_SERVICE_ROLE_KEY`   | Backend only | Privileged key for server-side operations — never ship this to the mobile bundle              |
| `SUPABASE_JWKS_URL`           | Backend      | JWT verification (auth middleware)                                                            |
| `DATABASE_URL` / `DIRECT_URL` | Backend      | Postgres via the Supabase pooler (transaction / session)                                      |
| `API_BASE_URL`                | Mobile       | URL of the running Express API — a LAN IP, not `localhost`, when testing on a physical device |

## Deployment

- **Frontend:** Vercel
- **Backend (Express API):** Render
- **Database, Auth, Storage:** Supabase

## Build order

Follow the dependency-ordered sequence in [`phases.md`](./phases.md). Critical
path to a demoable loop: schema -> auth -> scheme browser -> team assembly ->
DG approval -> site visit -> form/photos/issues -> view access -> dashboards.

## Project documentation

| File                                   | Contents                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [`PRD.md`](./PRD.md)                   | Product requirements — problem, roles, workflow, permission matrix, phased features, open questions |
| [`schema.md`](./schema.md)             | Entity/relationship model — ADP reference data + operational workflow, with the RLS join logic      |
| [`architecture.md`](./architecture.md) | Tech stack + backend hardening (security, performance, efficiency)                                  |
| [`phases.md`](./phases.md)             | Dependency-ordered build sequence                                                                   |
| [`Memory.md`](./Memory.md)             | **Current implementation status** and every non-obvious decision made along the way                 |

## Team

- Muhammad Ali Hadi — Full Stack Developer
- Muhammad Mustafa
- Rizwan Vadsariya

## Status

Internal project for the Sindh Secretariat — not for public distribution.
