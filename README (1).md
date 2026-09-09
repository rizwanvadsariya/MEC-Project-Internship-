# Smart Provincial M&E Management Ecosystem

A mobile-first monitoring platform for the Sindh Secretariat that tracks real-world progress on development schemes already approved under the province's Annual Development Programme (ADP) — team assignment, Director General approval, site-visit reporting, and issue escalation, all in one place.

> Professional/internship project at **Techclomate** (explicitly not a university FYP). Not affiliated with or endorsed by the Government of Sindh — built as a monitoring tool for internal secretariat use.

---

## Overview

Scheme progress today is tracked manually — paper reports, phone calls, disconnected spreadsheets — with no reliable way to verify claimed physical progress against the ADP booklet's own figures, and no structured trail of who's authorized to visit and report on a scheme. This app replaces that with a single workflow: a Regional Director assembles a field team, the Director General approves it, the assigned MEO visits the site and files photos/a progress form/any issues, and the whole record is visible (read-only) to the rest of the team and to leadership within that division.

Full product rationale, requirements, and open questions live in [`PRD.md`](./PRD.md).

## Key features (MVP)

- Role-based login with division/department assignment
- Read-only scheme browser — search/filter by division, district, department, sub-sector, status
- Regional Director team assembly (lead MEO + supporting MEOs + other-department staff, RD optional)
- Director General approval queue, with a revise-and-resubmit loop on rejection
- Site-visit creation, auto-enabled once a team is approved
- Sector-aware visit form (infrastructure/health/education/etc. have different checklist fields) with physical progress %
- Photo capture and upload per visit
- Issue reporting (type, severity, description)
- Division-scoped dashboards for RD/DG; strict view-only access for support users

The full phase-by-phase roadmap (notifications, offline mode, GIS maps, predictive risk flagging, and everything else past MVP) is in [`phases.md`](./phases.md).

> **Explicitly out of scope:** there is no "create/add a scheme" feature anywhere in this app. Scheme data is seeded once from the official ADP booklet via a backend import script — the app only ever reads and reports against schemes that already exist.

## User roles

| Role | Access |
|---|---|
| **Regional Director (RD)** | Assembles visit teams, submits for DG approval, full visibility within their own division |
| **Director General (DG)** | Approves/rejects proposed teams, full visibility within their own division |
| **MEO (lead)** | Visits the site, fills the form, uploads photos, files issues |
| **Support user** | Strictly view-only — sees the form, photos, and issues for visits they're assigned to |

Full permission matrix in [`PRD.md`](./PRD.md#7-role--permission-matrix).

## Tech stack (PERN)

| Layer | Technology |
|---|---|
| Database | PostgreSQL via [Supabase](https://supabase.com) |
| Backend | Node.js + Express.js |
| Frontend (mobile) | React Native |
| Auth / Storage | Supabase Auth + Supabase Storage |
| Frontend hosting | Vercel |
| Backend hosting | Render |

## How it works

```
RD builds team → DG reviews → (rejected → RD revises & resubmits) → approved
   → Lead MEO visits site: photos + form + issue report
      → Rest of team (view-only) + RD/DG (own division) can see the record
```

See `PRD.md` §6 for the detailed workflow write-up.

## Project documentation

| File | Contents |
|---|---|
| [`PRD.md`](./PRD.md) | Full product requirements — problem statement, roles, workflow, permission matrix, phased feature list, non-functional requirements, open questions |
| [`schema.md`](./schema.md) | Entity/relationship documentation for both the ADP reference data and the operational app data, in PostgreSQL terms |
| [`app-operational-schema.sql`](./app-operational-schema.sql) | Executable `CREATE TABLE` DDL for the operational schema — run this against your Supabase project |
| [`phases.md`](./phases.md) | Dependency-ordered build sequence — what gets implemented first and why |

## Getting started

> The steps below are a standard PERN + Supabase + Expo scaffold — adjust paths/scripts to match the actual repo layout once folders exist.

### Prerequisites

- Node.js (LTS) and npm or yarn
- A Supabase project (for Postgres, Auth, and Storage)
- Expo CLI, for running the React Native app
- Git

### Setup

1. Clone the repository.
2. Create a Supabase project and run [`app-operational-schema.sql`](./app-operational-schema.sql) against it (Supabase SQL editor or `psql`).
3. Run the one-time ADP booklet import script to seed `departments`, `sub_sectors`, `districts`, `divisions`, and `schemes` (see `phases.md`, Step 2) — there is no in-app way to add this data, so this step is required before the app has anything to show.
4. Install dependencies for the backend and the mobile app (`npm install` in each).
5. Configure environment variables (see below) for both the backend and the mobile app.
6. Start the backend API (`npm run dev` from the backend folder).
7. Start the mobile app with Expo (`npx expo start`) and open it in the Expo Go app or a simulator.

### Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `SUPABASE_URL` | Backend, mobile app | Supabase project URL |
| `SUPABASE_ANON_KEY` | Mobile app | Public client key for Supabase Auth/Storage |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend only | Privileged key for server-side operations — never ship this to the mobile app |
| `DATABASE_URL` | Backend | Direct Postgres connection string, if the API talks to Postgres outside the Supabase client |
| `API_BASE_URL` | Mobile app | URL of the deployed Express API (Render) |

## Deployment

- **Frontend:** Vercel
- **Backend (Express API):** Render
- **Database, Auth, Storage:** Supabase

## Roadmap

Development follows the numbered, dependency-ordered sequence in [`phases.md`](./phases.md) — Phase 0 (foundation: schema + auth + app shell) through Phase 4 (GIS maps, anomaly detection, predictive risk flagging). The critical path to a demoable end-to-end loop is 9 steps: schema → auth → scheme browser → team assembly → DG approval → site visit → form/photos/issues → view access → dashboards.

## Team

- Muhammad Ali Hadi — Full Stack Developer
- Muhammad Mustafa
- Rizwan Vadsariya

## Status

Internal project for the Sindh Secretariat — not for public distribution.
