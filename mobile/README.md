# Mobile — React Native (Expo, TypeScript)

Field-facing app for all four roles (RD, DG, MEO, Support). Talks only to the
Express API (`../backend`) over HTTPS + JWT — never directly to Supabase for
data, per `../architecture.md` §2.

## Layout

| Path | Responsibility |
|---|---|
| `src/api/` | Typed API client (axios + JWT refresh interceptor), one module per resource. |
| `src/auth/` | AuthProvider, `useAuth`, refresh-token kept in `expo-secure-store` (never AsyncStorage). |
| `src/navigation/` | Root navigator + one navigator per role (role-based routing). Deep-link config. |
| `src/screens/` | Screens grouped by role: `auth/`, `common/`, `regionalDirector/`, `directorGeneral/`, `meo/`, `supportUser/`. |
| `src/components/` | Reusable UI: `common/`, `forms/` (dynamic template renderer), `charts/`, `map/`. |
| `src/features/` | Per-domain hooks + query definitions (schemes, teams, approvals, siteVisits, issues). |
| `src/offline/` | SQLite store + sync queue for MEO forms/photos captured offline (Phase 2). |
| `src/i18n/` | English / Urdu / Sindhi string catalogs (Phase 2). |
| `src/theme/`, `src/utils/`, `src/hooks/`, `src/types/` | Cross-cutting. |

## Getting started

```bash
cp .env.example .env
npm install
npm start          # then open in Expo Go / a simulator
```
