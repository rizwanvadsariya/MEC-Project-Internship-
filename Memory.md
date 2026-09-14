# Memory.md — Project Status & Context Log

## Smart Provincial M&E Management Ecosystem

**Last updated:** September 14, 2026
**Current stage:** Phase 0 is fully complete, including every follow-up item that was previously left open. All 5 steps built (schema, ADP import, Auth, API skeleton + RLS, RN app shell), plus: RLS is now real Jest tests (not `test.todo`), `comments` is scoped per-entity (not open-read), MFA is fully implemented and verified end-to-end (enroll → challenge → verify → new aal2 session, both backend and a mobile self-service screen), the mobile API URL is env-driven instead of hardcoded, and the two root READMEs are merged into one. On top of that, the mobile UI now matches `ui-implementation.md` (see "Mobile UI theme" below). Next: Phase 1 features (scheme browser, team assembly, ...).

## Mobile UI theme (per `ui-implementation.md`) — IMPLEMENTED

`mobile/src/theme/index.ts` is now the real design-tokens source (colors, spacing, typography, a React Navigation theme, and one shared `stackScreenOptions` used by every navigator) instead of an empty stub — every screen and navigator pulls from it, nothing hardcodes a color.

- **Login screen** (`src/screens/auth/LoginScreen.tsx`) — went through two iterations, now a fully "advanced" photo-hero design per explicit user request (the first pass at ~13% opacity read as "too simple"):
  - The 3 real scheme photos (`mobile/assets/images/login/site-{1,2,3}.jpg` — a water treatment plant, a government school, a highway toll plaza; copied from the user-supplied `mobile/MEC pictures/` folder, which still exists alongside, untracked, not deleted) are now **fully visible**, crossfading every 5.5s (1.5s fade) with a continuous **Ken Burns zoom** (1.0 → 1.12 scale) per photo for a cinematic feel, not a static/low-opacity texture.
  - Bottom-weighted gradient scrim (dark green → transparent → dark) for legibility instead of a flat low-opacity wash.
  - Pagination dots track which of the 3 photos is active.
  - Frosted-glass card (`expo-blur`) holding the form, slide-up + fade entrance animation, floating shadow, rounded logo badge + branded title above it.
  - Icon-adorned inputs (`@expo/vector-icons` — mail/lock icons, show/hide password toggle) and a press-scale animation on the login button.
- **RoleHomeScreen**, **SecuritySettingsScreen**, and all 5 navigators (Root/Auth/RD/DG/MEO/Support) restyled off the shared theme tokens, replacing the old ad hoc dark theme.
- New deps installed via `npx expo install`: `react-native-reanimated` (4.5.1), `react-native-worklets` (0.10.x — Reanimated 4 moved its babel transform here), `expo-linear-gradient`, `expo-blur`, `@expo/vector-icons`. New `mobile/babel.config.js` (didn't exist before) registers `react-native-worklets/plugin`.
- **Animation library went through three iterations before landing on the right one — see below.** The user confirmed via `mobile/README.md` that the app is run through plain **Expo Go** (`npx expo start`), which is the key constraint: any third-party native animation module has to already be bundled inside Expo Go's fixed native-module set for the installed SDK, and that can't be verified without a real device/emulator this sandbox doesn't have.
  1. **`moti`** (per the spec's original wording) — removed. Its `MotiView`/`AnimatePresence` (moti 0.30.0) unconditionally call `usePresence()` from `framer-motion`, a DOM-only library that also resolves its own separate, mismatched copy of React (`moti/node_modules/react` at 19.3.0 vs. the project's 19.2.3). Any render crashed with `Cannot read property 'useRef' of null`. Exactly the "not Framer Motion, doesn't run in RN" trap `ui-implementation.md` §4 already called out, one dependency layer deeper than expected.
  2. **`react-native-reanimated` v4 + `react-native-worklets`** (the engine Moti itself wraps) — tried next, then also removed. It needs a babel-plugin transform (`react-native-worklets/plugin`, added via a new `babel.config.js`) that only takes effect after a full Metro cache-clear restart, and v4's native module has to exactly match what the user's Expo Go build bundles — neither is verifiable from this sandbox, and the user reported images still not showing after this was in place.
  3. **React Native's built-in `Animated` API** (from `'react-native'` core, no separate package) — what's actually shipped now. Zero native modules beyond what every RN app already has, zero babel plugin, so it can't be the reason something fails to render. All of the login screen's motion (crossfade, Ken Burns zoom, card/brand entrance, button press) is built on it. **`babel.config.js` was deleted again** (back to the project's original zero-custom-babel-config state) and `react-native-reanimated`/`react-native-worklets` uninstalled.
- **Tooling snags hit and fixed along the way:** `StyleSheet.absoluteFillObject` doesn't exist in this RN version's TS types (use an explicit `{position:'absolute', top:0,...}` object; `StyleSheet.absoluteFill` itself is still fine directly in a style array). `eslint-plugin-react-hooks`'s newer React-Compiler-style rules fought both animation approaches: `react-hooks/immutability` flagged Reanimated's sanctioned `sharedValue.value = x` as an error (moot now that Reanimated is gone), and `react-hooks/refs` flagged the standard `useRef(new Animated.Value(x)).current` pattern as "cannot access ref value during render" — fixed by using `useState(() => new Animated.Value(x))[0]` instead, which creates the same stable one-time instance without ever touching `.current`. No lint-disable comments needed in the end.
- **Verified:** `tsc --noEmit` and `eslint .` both clean; `npx expo export --platform android` compiled with exit code 0 at every stage (1546 modules initially → 1204 after dropping moti → 1283 after adding vector-icons/blur → 923 after dropping reanimated/worklets), correctly picking up the login images and icon fonts as bundled assets every time. Note: `expo export` only proves the bundle *compiles*, not that it renders — both the moti crash and the suspected reanimated issue could only have surfaced at runtime in Expo Go, which this sandbox can't run. If images still don't display after a `npx expo start -c` + full reload, the bug is somewhere neither `tsc`/`eslint`/`export` can see and needs an actual error message/screenshot from the user to diagnose further.
- The other Phase-1 screens (`SchemeBrowserScreen`, `ApprovalQueueScreen`, etc.) are still untouched 2-line stubs, not yet mounted in any navigator — nothing to theme there until they're actually built.
- Not committed — working tree only, on branch `phase0-cleanup`.

> Repo note: PR #1 (`feature/adp-schema-and-monitoring-workflow`), PR #2 (`Build_database`), and PR #3 (`Login_Screen_Implementation`) are all merged into `Main`. Current work is on branch `phase0-cleanup` (not yet pushed as of this update).

> This file exists so anyone — a teammate or an AI assistant — picking this project back up can tell exactly where things stand without re-reading the whole planning conversation. Update "Current stage" and "Next steps" as work actually progresses; everything else here is a decision record and should stay historical.

---

## Where we actually are

Per the build sequence in `phases.md`, Phase 0 is underway:

- **Step 1 (schema) — DONE.** All 26 domain tables + `audit_log`, 7 enums, 37 FKs and every index from `schema.md` §7 are applied to the live Supabase project via migrations `0001`–`0003`. Migration `0004` additionally extended `departments`, `schemes`, and `financial_year_allocations` with columns the real ADP CSVs carry that the original design didn't anticipate (see Key decisions #14).
- **Step 2 (ADP import) — DONE.** `backend/db/seeds/importAdpBooklet.js` loaded all 12 reference tables from `adp-database-seed-csv/*.csv` (committed at the repo root): 6 divisions, 30 districts, 50 departments, 112 sub-sectors, 10 funding sources, 17 SDG goals, **3,712 schemes**, 3,730 scheme-district links, 52 funding splits, 873 SDG tags (24 exact-duplicate rows deduped), 313 revision-history rows, 3,712 financial-year-allocation rows. Verified by direct query + spot-checked joins. Re-running the script is safe (it truncates and reloads the 12 reference tables in one transaction).
- **Step 3 (Auth) — DONE.** Full auth stack implemented and verified live — see "Supabase Auth setup" below for the complete breakdown.
- **Step 4 (API skeleton + RLS) — DONE.** Monorepo scaffold exists (`backend/`, `mobile/`, `shared/`, `docs/`, `.github/`). Backend boots, connects to Supabase, serves `GET /api/v1/health`. The `auth` slice of routes/controllers/services/repositories/middleware is real; every other resource (schemes, teams, approvals, ...) is still a documented stub — building those is Phase 1, not Phase 0. **RLS policies (migrations `0006`+`0007`) are live** — see "Row-Level Security" below.
- **Step 5 (RN app shell) — DONE.** See "React Native app shell" below.

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

**Not built:** the mobile MFA-enrollment screen — **now built, see the "MFA" section below.** Still genuinely not built: real email delivery for invites/resets (no SMTP configured — Supabase's default sending may or may not be sufficient at volume), and a real alert channel for point #8's "notify on DG/RD lockout" (currently just a `LOGIN_LOCKED` audit_log row with `highValueAccount: true` — no email/Slack/push wired up). Both require third-party service credentials only the user can provide (an SMTP/email provider, a Slack webhook, etc.) — not something to build blindly without them.

## Row-Level Security (Phase 0 Step 4) — IMPLEMENTED and verified live

**Discovery before writing any policy:** RLS was already enabled on all 27 tables (`relrowsecurity = true` everywhere, cause unknown — likely a Supabase project default) but had **zero policies**, meaning every table was already fully deny-all for `authenticated`/`anon` and reachable only through the backend's RLS-bypassing `postgres` connection. Writing policies didn't have to "turn on" protection — it had to make the app's per-user rules real instead of a blanket lock the backend happens to tunnel under.

**What was built (migrations `0006`, `0007`):**
- `REVOKE ALL ... FROM anon` — this app has no unauthenticated use case; `anon` gets no policies anywhere either.
- SECURITY DEFINER helper functions (`auth_user_role()`, `auth_user_division_id()`, `can_view_scheme()`, `can_view_site_visit()`, `is_lead_meo_for_site_visit()`, `is_member_of_team()`, `is_lead_meo_of_team()`, `team_scheme_id()`, `team_created_by()`) — these read `users`/`visit_teams`/`visit_team_members` as the function owner, bypassing the caller's own RLS, which is both the standard Supabase pattern for "who am I" checks and (as it turned out) load-bearing for avoiding recursion.
- **Schemes + everything keyed off a scheme** (`scheme_districts`, `scheme_funding`, `scheme_sdg`, `revision_history`, `financial_year_allocations`): visible only if in the caller's own division (RD/DG/MEO), or fully open for `SUPPORT_USER`.
- **`users`**: own row, or (RD/DG) anyone in the same division.
- **`visit_teams`/`visit_team_members`**: RD creates/edits within their own division; RD/DG see everything in-division; MEO/Support see only teams they're a member of.
- **`team_approval_requests`**: the submitting RD, or the DG of that scheme's division; append-only (no delete policy).
- **`site_visits`**: same division/membership split; the team's `LEAD_MEO` can update status/timestamps.
- **`visit_forms`/`visit_photos`/`issue_reports`/`issue_report_photos`**: read = same visibility as the parent site visit; write = the `LEAD_MEO` only.
- **`comments`**: `can_view_commentable(type, id)` (added in migration `0008`, dispatches to `can_view_scheme`/`can_view_team`/`can_view_site_visit`/an issue-report join by `commentable_type`) — no longer open-read; insert still blocked for `SUPPORT_USER`.
- **`notifications`**: strictly own rows.
- Pure reference lookups (`divisions`, `districts`, `departments`, `sub_sectors`, `funding_sources`, `sdg_goals`, `form_templates`, `form_template_fields`): open read, no write policy anywhere (import/admin stays `postgres`-only).
- `audit_log`, `schema_migrations`: no policies at all — stay fully deny-all by design.

**Bug caught and fixed by testing:** `0006`'s `visit_teams` policy queried `visit_team_members` directly, and `visit_team_members`'s policy queried `visit_teams` directly — each subquery re-triggers the other table's RLS, so Postgres threw `infinite recursion detected in policy for relation "visit_teams"` the moment a real query touched either table. Fixed in `0007` by routing every cross-table check through the SECURITY DEFINER helpers instead of raw subqueries — those bypass RLS internally, breaking the cycle. Lesson: **any RLS policy whose subquery touches a table that itself has RLS is a recursion risk if that table's policy queries back** — wrap cross-table reads in SECURITY DEFINER functions from the start next time, don't wait to hit the recursion error.

**Verification:** a from-scratch Postgres test (`SET ROLE authenticated` + `SET request.jwt.claims` to simulate each of the 4 seeded users, real fixture rows for a team/visit in Karachi vs. one in Jacobabad, all in rolled-back transactions) — **22/22 checks passed**: division isolation both directions (schemes, users, teams, site visits), team-membership scoping for MEO/Support, `LEAD_MEO`-only writes to `visit_forms` (a non-lead RD's insert attempt threw the expected RLS violation), `SUPPORT_USER` blocked from posting a comment while RD could, and `anon` getting zero rows from `schemes`. Confirmed afterward that the app itself (connects as `postgres`, bypasses RLS) was completely unaffected — `/health` and login still worked identically post-migration.

**Update — both follow-ups closed (Phase 0 cleanup pass):**
- **Migration `0008`** scopes `comments` per entity (`can_view_team()` added alongside `can_view_commentable()`); the "open read" simplification above no longer applies.
- **`backend/tests/integration/rls/*.test.js` are now real Jest specs**, not `test.todo`. They run against the **real Supabase project** using the 4 seeded test accounts (`tests/globalSetup.js` checks `DIRECT_URL` + that the accounts exist; `tests/helpers/{pgTestClient,rlsFixtures}.js` do the `SET ROLE authenticated` simulation and fixture setup/teardown) rather than a disposable local Postgres — Docker isn't available on this dev machine, so the originally-planned "fake `auth.users` in a local container" approach (`docker-compose.yml`, still present but unused) was dropped in favor of what was already proven to work manually. Fixtures never touch `auth.users` or reference tables — only real, existing test accounts + disposable `visit_teams`/`site_visits`/`comments` rows, always cleaned up. Result: **14 real assertions pass**, 9 more remain `test.todo` (the supertest-based route/service tests, genuinely separate Phase-1-scale work). Runs against a clean `npm ci` with no `.env` (CI's exact situation) confirmed these skip gracefully rather than fail.
- **Lesson learned mid-implementation:** a test run killed mid-flight (a hung backgrounded shell command, unrelated to the tests themselves) left 2 orphaned `visit_teams`/`site_visits` rows in the real project. Fixed by having `createFixtures()` delete any stale rows `created_by` the RD test account *before* creating new ones, so a crashed run self-heals on the next run instead of accumulating junk.

## React Native app shell (Phase 0 Step 5) — IMPLEMENTED, verified via Metro bundle compile

Option A's consequence (no self-service signup) means this is just: navigation, a role-based routing stub, a real API client, and a working login screen.

**Built:**
- `src/api/client.ts` — fetch wrapper reading the base URL from `app.json`'s `expo.extra.apiBaseUrl`, attaches the bearer token, parses the backend's `{data}`/`{error}` envelope into typed results or a thrown `ApiClientError` (message + code).
- `src/auth/{AuthProvider,useAuth,secureStorage}` — calls the real `POST /auth/login` + `GET /auth/me`, session stored via `expo-secure-store`, re-validated on app launch (a dead/expired session is dropped silently rather than shown as an error).
- `src/screens/auth/LoginScreen.tsx` — real form; surfaces the backend's actual error messages (`INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `ACCOUNT_DEACTIVATED`, `MFA_REQUIRED`, etc.) rather than a generic failure.
- `src/navigation/RootNavigator.tsx` — branches: loading → spinner; unauthenticated → `AuthNavigator` (Login only); authenticated → the matching role navigator (RD/DG/MEO/Support), each currently rendering a shared `RoleHomeScreen` stub (profile + logout) — this is the literal "role-based routing stub" the phase asks for; Phase 1 replaces each with the real screens already stubbed under `src/screens/{regionalDirector,directorGeneral,meo,supportUser}`.

**Dependency recovery, not a fresh install:** the user had already run a partial `expo install` (SDK 57, `expo` + `expo-secure-store`) directly in `mobile/` before this work started; that `package.json` got set aside by an earlier `git stash` during a branch switch and was recovered rather than reinstalling from scratch, then extended with `@react-navigation/native` + `native-stack`, `react-native-screens`, `react-native-safe-area-context`, `react-native-gesture-handler`, `expo-constants` — all resolved via `npx expo install` so versions are guaranteed SDK-57-compatible rather than guessed.

**Verification:** `npx tsc --noEmit` clean; requested the actual compiled bundle from Metro for both `platform=android` and `platform=ios` — both compiled with zero errors, which is the strongest signal available without a physical device. Confirmed the backend is reachable from the phone's side of the network, not just localhost, and that Windows Firewall already allows Node on the `Public` profile (the classification this Wi-Fi network has). Actually rendering on the physical device is inherently something only a human can confirm.

**Update — the hardcoded-LAN-IP follow-up is closed:** `app.json` was replaced with **`app.config.js`** (Expo's dynamic config), which reads `apiBaseUrl` from the `API_BASE_URL` env var (falls back to `localhost`, fine for a simulator/emulator but not a physical device) instead of a value baked in at whatever IP the last person to touch it happened to be on. Usage: `API_BASE_URL=http://<your-LAN-IP>:4000/api/v1 npx expo start` — documented in `mobile/README.md`. Verified `npx expo config` resolves both the default and an overridden value correctly.

## MFA (Phase 0 Step 3, hardening point #7) — IMPLEMENTED and verified live, backend + mobile

Backend and mobile self-service enrollment, closing the "no MFA-enrollment screen" gap that previously blocked ever turning on `MFA_ENFORCEMENT_ENABLED`.

**Backend — proxied through Express, never a direct Supabase call from the client** (same reasoning as login): `services/auth.service.js`'s `clientForUser(accessToken)` builds a one-off `supabase-js` client scoped to the caller's own access token (their `auth.mfa.*` methods act on "the client's current session," so a per-user client is the only way to act on their behalf server-side) — a pure Supabase-Auth-service call, unrelated to the service-role key's RLS-bypass privileges. Routes: `POST /auth/mfa/enroll`, `POST /auth/mfa/challenge`, `POST /auth/mfa/verify` (returns a **new aal2 session** — the caller must swap in the new tokens), `GET /auth/mfa/factors`, `DELETE /auth/mfa/factors/:factorId`. `authenticate.js` now also attaches `req.accessToken` (the raw bearer token, not just its decoded claims) since these routes need it. `authorize()` gained a `{ skipMfaCheck: true }` trailing-argument form for exactly these 5 routes — without it, once `MFA_ENFORCEMENT_ENABLED` is ever turned on, a DG/RD who hasn't finished enrolling could never reach the route that lets them finish (a real catch-22 caught while designing this, not just while testing it).

**Mobile — `src/screens/common/SecuritySettingsScreen.tsx`**, reachable from every role's `RoleHomeScreen` via a new "Security settings" button (added to all 4 role navigators as a second stack screen, `useNavigation()`-driven). No QR-image library — the secret is shown as selectable plain text for "enter a setup key" manual entry, keeping the screen dependency-free. Flow: enroll → show secret → 6-digit code input → verify → `updateSession()` (new method on `AuthProvider`) swaps in the returned aal2 tokens without a full re-login. Available to all roles, not just DG/RD — anyone can opt in early; `MFA_ENFORCEMENT_ENABLED` (still `false`) is what would make it *required* for DG/RD specifically.

**Verification — full round trip against live Supabase, not mocked:**
- Implemented RFC 6238 TOTP generation from scratch (Node's built-in `crypto`, no library) to compute real codes for testing — validated against the **official RFC 6238 test vector** first (exact match), so the algorithm itself was proven correct before ever touching the live enroll/challenge/verify flow.
- First live attempts failed with "Invalid TOTP code entered" — traced to this **sandbox's system clock being ~2–3 minutes off from Supabase's real server time** (confirmed precisely via Supabase's own HTTP `Date` response header), not a code defect. Recomputing the code using Supabase's authoritative time instead of local `Date.now()` succeeded immediately: enroll → challenge → verify returned a real new session. This is a sandbox/test-tooling artifact only — production correctness is unaffected, since `verify` is validated entirely by Supabase's own clock, never the backend's; a real user's phone stays NTP-synced normally.
- Confirmed `listFactors` categorizes an *unverified* (abandoned mid-enrollment) factor under `all` but not under the `totp` array — the enrollment flow and its cleanup both need to check `all`, not the type-specific array; got this wrong once while testing (an enroll attempt failed with "factor with this friendly name already exists" until the stale factor was found via `all` and deleted).
- Full cleanup confirmed after every test run — `dg.test@mec.local` (and every other seeded account) has zero MFA factors left over.

## CI fixes (`Login_Screen_Implementation` PR) — both `backend-ci` and `mobile-ci` were failing

None of this was caused by the app-shell or RLS code itself — it's the CI workflows describing a pipeline that was scaffolded early (architecture.md's aspirational checklist) but never actually built out to match what exists. Found by reproducing each CI step locally rather than guessing from the PR's red X:

1. **Root cause of both jobs failing immediately:** `eslint` was never installed as a real dependency in either `backend/` or `mobile/` — only `.eslintrc.json` config files existed. `npm run lint` is the first real step after `npm ci`, so both jobs died there.
2. **Backend `npm test` would have failed next:** all 6 files under `backend/tests/` were empty stubs (a header comment, zero actual `test()` calls) — Jest fails each with "must contain at least one test." Fixed by converting the comments into `test.todo(...)` calls (Jest's built-in "planned, not written yet" marker — valid, doesn't fail the suite) and installing `jest` for real.
3. **Backend `npm run migrate` would have failed after that, and can't be trivially fixed:** the schema has `users.id references auth.users(id)` (schema.md §4.1), which only exists on a real Supabase project — CI's plain `postgres:16` service container has no `auth` schema at all. Rather than fake it, removed the `migrate`/`check:rls` steps (and the now-unused `postgres` service block) from `backend-ci.yml` entirely, with a comment explaining why, until either a fake `auth.users` stand-in or a real CI-provisioned Supabase instance (e.g. a preview branch) exists.
4. **Mobile `npm test --if-present` would have failed too:** the flag only skips a *missing* script; `"test": "jest"` was present, jest wasn't installed, and there were no test files. Installed `jest-expo` + `jest`, added `jest.config.js` with `passWithNoTests: true` (honest given zero tests exist yet, keeps CI green until the first real one is written).

**Also fixed along the way:** both `.eslintrc.json` files were legacy-format and incompatible with the ESLint version that would get installed (ESLint 9+/10 ignores `.eslintrc.json` entirely, flat config only) — replaced with `eslint.config.js` in both projects (`@eslint/js` + `globals` for backend's plain `eslint:recommended`-equivalent; `eslint-config-expo`'s flat preset for mobile, installed via `npx expo lint` rather than guessed, since it resolves the current SDK-57-compatible version). Two real (minor) issues the new mobile linter caught and fixed: an unused catch-binding in `api/client.ts`, and `apiBaseUrl` imported twice in `LoginScreen.tsx`.

**Verified by reproducing every CI step locally, from a clean `npm ci` (exactly what the runner does), for both projects:** `npm run lint`, `npm audit --audit-level=high` (backend only), `npm test`/`npm run typecheck` all pass with exit 0.

## Artifacts produced so far

| File                         | What it is                                                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PRD.md`                     | Full product requirements — problem statement, roles, workflow, permission matrix, phased feature list, non-functional requirements, open questions                                |
| `schema.md`                  | Entity/relationship documentation covering both the ADP booklet reference data and the operational app data, in PostgreSQL/Supabase terms (supersedes an earlier MERN-based draft) |
| `app-operational-schema.sql` | _Superseded_ by the numbered `backend/db/migrations/*` files (see Code artifacts below) — kept only as historical reference if still present                                        |
| `phases.md`                  | Dependency-ordered, 34-step build sequence across Phase 0–4, with a 9-step critical path called out                                                                                |
| `README.md`                  | Project front door — merged from the original product README and the monorepo guide (`README (1).md`, now deleted) into one file: overview, roles, tech stack, repo layout, real getting-started commands, docs index |
| `architecture.md`            | Tech stack + backend hardening (security / performance / efficiency); the layered-architecture spec the scaffold follows                                                            |

### Code / infra artifacts (added after planning)

| Artifact | What it is |
| --- | --- |
| Monorepo scaffold | `backend/` (Express, layered `routes→controllers→services→repositories` + `middleware/`, `db/migrations`, `db/seeds`, `tests/`), `mobile/` (React Native + Expo, TS, role-partitioned `screens/`), `shared/` (role/enum constants), `docs/`, `.github/workflows/` (CI). Most files are documented stubs. |
| `backend/src/config/` | Real wiring: `index.js` (env + zod validation, fails fast on placeholders), `database.js` (`pg` pool on the Supabase transaction pooler), `supabase.js` (service-role client). |
| `backend/.env` | Filled with the live project: `SUPABASE_URL` (ref `fcneocvlbgmasatfpvrd`), service-role secret key, JWKS URL, `DATABASE_URL`/`DIRECT_URL` via the Supavisor pooler (`aws-0-ap-northeast-1`, ports 6543 / 5432, password URL-encoded). Git-ignored. |
| `backend/scripts/check-db.js` | `npm run check:db` — Postgres + Supabase Storage connectivity check. Passes. |
| `backend/scripts/migrate.js` | `npm run migrate` / `migrate:status` — applies `db/migrations/*.sql` in order via `DIRECT_URL`, tracks in `schema_migrations`. Migrations are immutable once applied. |
| `backend/db/migrations/0001–0008` | `0001` reference tables, `0002` operational tables + enums + `updated_at` triggers, `0003` indexes, `0004` extends `departments`/`schemes`/`financial_year_allocations` to match the real ADP CSV columns, `0005` adds `users.failed_login_count`/`locked_until` (login lockout), `0006` RLS policies, `0007` fixes RLS recursion, `0008` scopes `comments` per entity. All applied to Supabase. |
| `backend/src/{middleware,repositories,services,controllers,validators}` auth slice | Full Supabase Auth implementation incl. MFA proxy routes — see "Supabase Auth setup" + "MFA" above. Verified against the live project with real login/provision/deactivate/lockout/session/reset-password/MFA enroll-challenge-verify calls. |
| `backend/tests/{globalSetup.js, helpers/{pgTestClient,rlsFixtures}.js}` | Real RLS Jest test infra — connects to the live Supabase project via `DIRECT_URL`, simulates each seeded test account, self-skips if unavailable (e.g. in CI). |
| `backend/eslint.config.js`, `mobile/eslint.config.js`, `mobile/jest.config.js` | Flat ESLint configs (replace the legacy `.eslintrc.json` files, deleted) + a `passWithNoTests` Jest config for mobile. |
| `adp-database-seed-csv/` (repo root) | 12 CSVs, one per reference table, exported from the government ADP ledger — the source of truth `importAdpBooklet.js` reads. Committed to the repo (not git-ignored). |
| `backend/db/seeds/importAdpBooklet.js` | `npm run seed:adp` — real implementation (was a stub). Truncates + reloads the 12 reference tables in one transaction, preserves the CSVs' own ids (`OVERRIDING SYSTEM VALUE` + sequence resync), dedupes the 24 exact-duplicate `scheme_sdg` rows. |
| `mobile/App.tsx`, `src/navigation/*`, `src/auth/*`, `src/api/{client,auth,mfa}.api.ts`, `src/screens/{auth/LoginScreen,common/{RoleHomeScreen,SecuritySettingsScreen}}.tsx` | The full React Native app shell + MFA enrollment screen — see "React Native app shell" + "MFA" above. |
| `mobile/app.config.js` | Replaces the old static `app.json` — reads `apiBaseUrl` from the `API_BASE_URL` env var instead of a hardcoded LAN IP. |

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
18. **RLS was already enabled on every table with zero policies before we wrote any** — origin unknown, likely a Supabase project default. Meant enabling RLS wasn't part of this work, only writing the actual policies.
19. **`anon` gets no RLS policies anywhere and had its default grants revoked** — this app has no unauthenticated use case (mobile always authenticates via Supabase Auth first).
20. **Cross-table RLS policies must go through SECURITY DEFINER helper functions, never raw subqueries on another RLS-protected table** — a raw two-way subquery between `visit_teams` and `visit_team_members` caused a live "infinite recursion detected in policy" error, fixed in migration `0007`. Apply this rule from the start on any future cross-table policy.
21. **`comments` visibility is intentionally left open-read for now** (not scoped per `commentable_type`/`commentable_id`) — a real per-entity join wasn't built; only the `SUPPORT_USER` posting restriction is enforced. ~~Revisit before comments ships as a feature.~~ **Done — migration `0008`, see "Row-Level Security" above.**
22. **RLS Jest tests run against real Supabase, not a disposable local Postgres** — Docker isn't installed on this dev machine, so the fake-`auth.users`-in-a-container plan (`docker-compose.yml`, still present but unused) was dropped for what already worked: the 4 real seeded test accounts + fixtures that only ever touch operational tables, cleaned up after every run.
23. **MFA is proxied through the backend, including enrollment** — the mobile app still never talks to Supabase directly (architecture.md §2), even for TOTP setup. `authorize()` needed a `{ skipMfaCheck: true }` escape hatch for the MFA routes themselves, or a DG/RD could never reach the route that lets them finish enrolling once enforcement is ever turned on.
24. **No QR-image library for MFA enrollment** — the secret is shown as selectable text for manual "enter a setup key" entry instead, keeping the mobile app dependency-free. Revisit if a real QR scan flow is wanted later.
25. **TOTP verification failures during testing were a sandbox clock-drift artifact (~2–3 minutes off from Supabase's real time), not a code defect** — confirmed by validating the from-scratch RFC 6238 implementation against the official test vector first, then against Supabase's own authoritative HTTP `Date` header. No production impact: Supabase's own clock validates the code, never the backend's.
26. **RLS test fixtures self-heal from a crashed prior run** — `createFixtures()` now deletes any stale `visit_teams`/`site_visits` rows `created_by` the RD test account before creating new ones, after a killed background test process once left 2 such rows behind in the real project.
27. **Near-miss during the README cleanup:** a cleanup command briefly deleted `PRD (1).md` too (not intended — only the duplicate README was meant to go). It was tracked by git, so `git checkout -- "PRD (1).md"` recovered it losslessly before anything was committed; flagged here rather than silently glossed over.

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
- [x] Add RLS policies scoped by division (migrations `0006`+`0007`) — 22/22 direct-Postgres verification checks passed
- [x] Build the React Native app shell (navigation, role-based routing stub, API client, login screen — see "React Native app shell" above)
- [x] Fix `backend-ci`/`mobile-ci` (both were failing — see "CI fixes" above): eslint + jest actually installed, flat configs, empty test stubs converted to `test.todo`, `migrate`/`check:rls` steps removed from backend-ci (can't run against CI's plain Postgres)
- [x] Wire the RLS verification script into real Jest specs in `backend/tests/integration/rls/` — 14 real assertions against the live project, 9 still `test.todo` (route/service integration tests needing supertest, separate Phase-1-scale work)
- [x] Tighten `comments` SELECT to be scoped per `commentable_type`/`commentable_id` instead of open-read (migration `0008`)
- [x] MFA backend proxy routes + a mobile self-service enrollment screen (`SecuritySettingsScreen.tsx`) — full round trip verified live against Supabase
- [x] Mobile API URL is now env-driven (`app.config.js` + `API_BASE_URL`), not hardcoded to one machine's LAN IP
- [x] Housekeeping: the two root READMEs are merged into one `README.md` (`README (1).md` deleted)
- [ ] Flesh out the remaining backend routes/controllers/services/repositories for Phase 1 (start with the scheme browser — auth is done)
- [ ] Real email delivery for invite/reset links (SMTP not configured) and a real alert channel for DG/RD lockouts (currently audit_log-only) — both blocked on third-party service credentials only the user can provide
- [ ] A real way to run backend migrations/integration tests in CI (fake `auth.users` in the CI Postgres, or a Supabase preview-branch instance) — deferred, see "CI fixes" above; the real Supabase-backed RLS tests above are a workable middle ground for local dev in the meantime
- [ ] Convert the RLS standalone-script-turned-Jest-tests' remaining 9 `test.todo`s (route/service level) into real `supertest`-driven specs
- [ ] Commit + push this Phase 0 cleanup work (branch `phase0-cleanup`, not yet pushed as of this update)

## Team

- Muhammad Mustafa
- Rizwan Vadsariya
