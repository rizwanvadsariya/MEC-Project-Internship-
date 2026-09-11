# Smart Provincial M&E Management Ecosystem — Monorepo

Mobile-first monitoring platform for the Sindh Secretariat: RD assembles a field
team -> DG approves -> MEO visits the scheme site and files a form + photos +
issues -> the team and division leadership see the record (read-only).

Full context: [`PRD.md`](./PRD.md) · [`schema.md`](./schema.md) ·
[`architecture.md`](./architecture.md) · [`phases.md`](./phases.md) ·
[`Memory.md`](./Memory.md) (current status).

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

## Stack

| Layer | Choice |
|---|---|
| Database / Auth / Storage | PostgreSQL, Auth, Storage — Supabase |
| Backend API | Node.js + Express (hosted on Render) |
| Mobile client | React Native + Expo (TypeScript) |
| Frontend hosting | Vercel |

## First run

```bash
# 1. Backend
cd backend && cp .env.example .env   # fill Supabase URL + service role key + DATABASE_URL
npm install && npm run migrate
npm run seed:adp -- --file ./db/seeds/adp/<ledger>.json
npm run seed:templates && npm run seed:accounts
npm run dev

# 2. Mobile (separate terminal)
cd mobile && cp .env.example .env    # set API_BASE_URL + SUPABASE anon key
npm install && npm start
```

## Build order

Follow the dependency-ordered sequence in [`phases.md`](./phases.md). Critical
path to a demoable loop: schema -> auth -> scheme browser -> team assembly ->
DG approval -> site visit -> form/photos/issues -> view access -> dashboards.

