# Backend — Express API

Layered per `../architecture.md` §3: **routes -> controllers -> services -> repositories**,
with `middleware/` for auth, RBAC, validation, rate limiting, logging and error
handling. `repositories/` is the only layer that touches Postgres.

## Layout

| Path | Responsibility |
|---|---|
| `src/server.js` | Process bootstrap (port, signals). |
| `src/app.js` | Express app + middleware chain. No `.listen`. |
| `src/config/` | Env loading/validation, Supabase client, PG pool, cache. |
| `src/api/v1/` | Versioned router; `routes/*` map verb+path -> middleware -> controller. |
| `src/controllers/` | Request parsing + response shaping. No SQL, no rules. |
| `src/services/` | Business logic. Framework-free, unit-testable. |
| `src/repositories/` | The only DB layer. Parameterized queries, joins, cursor pagination. |
| `src/middleware/` | authenticate, authorize, divisionScope, validate, rateLimit, logging, errors. |
| `src/validators/` | Per-endpoint request schemas. |
| `src/jobs/` | Background work (notification fan-out, ADP re-import, digests). |
| `src/lib/` | logger, ApiError, ApiResponse, asyncHandler, pagination, storage. |
| `db/migrations/` | SQL: reference tables, operational tables, indexes, **RLS policies**, template seed. |
| `db/seeds/` | ADP booklet import (the only scheme-data entry point), form templates, test accounts. |
| `tests/` | `unit/` services, `integration/routes/` via supertest, `integration/rls/` policy checks. |

## Getting started

```bash
cp .env.example .env      # then see "Connecting Supabase" below
npm install
npm run check:db          # verify the Postgres + Supabase connection
npm run migrate           # apply db/migrations/*
npm run seed:adp -- --file ./db/seeds/adp/<ledger>.json
npm run seed:templates && npm run seed:accounts
npm run dev
```

## Connecting Supabase

Two connections, both configured from `.env`:

| Var | Where in the dashboard | Used by |
|---|---|---|
| `SUPABASE_URL` | Settings → API → **Project URL** | `config/supabase.js`, JWKS URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → **service_role / secret** — backend only, never in `mobile/` | `config/supabase.js` |
| `SUPABASE_JWKS_URL` | `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` | JWT-verify middleware (later) |
| `DATABASE_URL` | Settings → Database → Connection string → **Connection pooling**, Mode **Transaction** (port **6543**) | `config/database.js` — the `pg` pool the repositories use |
| `DIRECT_URL` | Same panel, **Session**/direct (port **5432**) | migrations only (`scripts/migrate.js`) |

Notes:
- Percent-encode special characters in the DB password (`@` → `%40`).
- The pooler host is `aws-0-<region>.pooler.supabase.com` and the user is
  `postgres.<project-ref>` — not plain `postgres`.
- Keep `?sslmode=require` on both URLs. The pool also sets `ssl.rejectUnauthorized: false`.
- On the transaction pooler: no `LISTEN/NOTIFY`, no session `SET`, no explicit
  `PREPARE` — repositories use plain `$1` parameterized queries only.

`config/index.js` validates all of this on startup and prints exactly which
values are still `REPLACE_ME` placeholders. Wiring already in place:
`config/index.js` (env + zod validation), `config/database.js` (`pg` pool +
`ping()`), `config/supabase.js` (service-role client), and
`GET /api/v1/health` (DB round-trip probe).
