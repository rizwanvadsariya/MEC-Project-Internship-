# Implementation Phases — Build Sequence

This document defines the **order of implementation** for every functionality listed in `PRD.md`, with the dependency each step relies on. It answers "what do we build first, and why" — the phase groupings match the PRD, but steps here are numbered continuously so the whole project reads as one build sequence.

Note: there is no "create/seed a scheme" *feature* anywhere below — per the confirmed scope, scheme data enters the system once via a one-time backend import script (Step 2), not through the app itself.

---

## Phase 0 — Foundation (pre-requisite, not user-facing)

Nothing in Phase 1 can be built until these exist — they're infrastructure, not features.

| Step | Item | Depends on | Why it comes here |
|---|---|---|---|
| 1 | Provision Supabase project; run the full Postgres schema (`app-operational-schema.sql` + the reference tables from `schema.md`) | — | Everything else reads from or writes to this schema |
| 2 | One-time ADP booklet data import script — seeds departments, sub-sectors, districts, divisions, and schemes | 1 | The app has nothing to browse or assign teams against until scheme data exists |
| 3 | Supabase Auth setup — `user_role` enum wired up, division/department fields on signup, seed test accounts for all 4 roles | 1 | Every subsequent screen is role-gated |
| 4 | Express/Node API skeleton — route structure, Supabase client, auth middleware, base RLS policies scoped by division | 1, 3 | The mobile app needs an API contract to build against |
| 5 | React Native app shell — navigation, role-based routing stub, API client, login screen | 3, 4 | The first thing a user sees; nothing else has a screen to live in until this exists |

---

## Phase 1 — Core MVP

| Step | Functionality | Depends on | Why this order |
|---|---|---|---|
| 6 | Role-based home screens (empty-state dashboards per role) | 5 | Confirms routing + auth actually branch correctly per role before real data is wired in |
| 7 | Scheme browser (read-only search/filter by division, district, department, sub-sector, status) | 2, 4, 6 | Almost every later feature ("assemble a team for *this* scheme") needs a way to pick a scheme first |
| 8 | Team assembly flow — RD creates a team, adds lead MEO + supporting members | 3, 7 | Needs both real users (3) and a scheme to attach the team to (7) |
| 9 | DG approval queue — approve/reject with remarks, resubmission loop | 8 | Can't review a team that doesn't exist yet |
| 10 | Site visit auto-creation on team approval | 9 | A visit only makes sense once a team is actually approved |
| 11 | Dynamic form templates seeded per department (infrastructure/health/education checklist fields) | 1, 2 | Independent of 8–10, but must exist *before* Step 12 needs a template to render |
| 12 | Visit form fill (lead MEO): progress %, remarks, sector-specific fields | 10, 11 | Needs both a visit to attach to and a template to render |
| 13 | Photo capture/upload (Supabase Storage bucket wired up) | 10 | Needs a visit to attach photos to |
| 14 | Issue reporting (type, severity, description) | 10 | Needs a visit to attach the issue to |
| 15 | View-only access for other team members (form/photos/issues) | 12, 13, 14 | Nothing to view until the lead MEO has actually filled something in |
| 16 | Division-scoped RD/DG dashboards (teams, visits, issues in their division) | 9, 10, 12, 13, 14 | A dashboard is only meaningful once there's real activity to summarize |

**End of Phase 1 = a working end-to-end loop:** RD assembles a team → DG approves → MEO visits and reports → team + division leadership can see it.

---

## Phase 2 — Usability & day-to-day operations

| Step | Functionality | Depends on | Why this order |
|---|---|---|---|
| 17 | Notification infrastructure — push token registration + triggers (team approved/rejected, issue filed, visit completed) | 9, 10, 14 | Needs real events from Phase 1 to notify on |
| 18 | Offline mode for MEO forms/photos (local queue + background sync) | 12, 13 | Only worth building once the online version is proven correct — offline sync compounds bugs if the base flow isn't solid |
| 19 | GPS geo-tagging on photo/visit capture | 13 | Extends the existing photo capture flow rather than being a new one |
| 20 | Comments/discussion thread (RD, DG, MEO only — support users excluded) on a scheme or visit | 7, 10 | Needs schemes and visits to exist as things to comment on |
| 21 | Visit scheduling calendar (RD / lead MEO plan upcoming visits) | 9 | Scheduling only makes sense for teams that are already approved |
| 22 | Multi-language UI (Urdu / Sindhi / English) | 6–16 | Applied once core screens are stable, to avoid re-translating strings that are still changing |
| 23 | Basic analytics — progress % by division/department, status breakdown | 16 | Extends the Phase 1 dashboards once enough visit data has accumulated to be meaningful |

---

## Phase 3 — Monitoring & accountability

| Step | Functionality | Depends on | Why this order |
|---|---|---|---|
| 24 | Issue lifecycle tracking (open → acknowledged → in progress → resolved, owner, due date) | 14 | Extends the existing issue report record with state |
| 25 | Escalation rules (e.g. a `CRITICAL` issue auto-notifies the DG regardless of team) | 17, 24 | Needs both notification infrastructure and issue states to escalate between |
| 26 | Full audit trail UI (surfaces the approval history already captured since Step 9) | 9 | The data has existed since Phase 1 by design — this step is purely a UI to expose it |
| 27 | Physical vs. financial progress reconciliation (MEO-reported % vs. ADP-booklet financial progress) | 2, 12 | Needs both the imported financial data and real physical-progress data to compare |
| 28 | QR scan-to-open (scan a scheme's printed ADP QR code to open its record) | 7 | A shortcut into the scheme browser — needs that browser to exist first |
| 29 | PDF/Excel export for offline reporting | 16, 23 | Exports the dashboard/analytics views, so those need to exist and be trustworthy first |

---

## Phase 4 — Advanced / province-wide intelligence

| Step | Functionality | Depends on | Why this order |
|---|---|---|---|
| 30 | GIS map view (schemes by division/district, color-coded by progress or issue severity) | 7, 23 | Needs scheme/location data and progress data to color the map by |
| 31 | Delay/anomaly detection (no visit in X months, spend-without-progress patterns) | 10, 12, 27 | Needs a real accumulated visit history over time — this can't be built (or validated) on day-one data |
| 32 | Automated digest reports (weekly/monthly, scoped per DG/RD division) | 17, 23 | Combines existing notification infrastructure with existing analytics |
| 33 | Predictive risk flagging (schemes likely to miss target completion date) | 31 | Builds directly on the anomaly-detection foundation |
| 34 | Custom KPI dashboards per role (same data model, different scope: province vs. division) | 23, 30, 31, 33 | The final layer — combines every analytics building block built so far |

---

## Summary: critical path

The one sequence that must be strictly linear (everything else can shuffle somewhat within its phase) is:

```
Schema + seed data (1–2)
  → Auth (3)
    → Scheme browser (7)
      → Team assembly (8)
        → DG approval (9)
          → Site visit (10)
            → Form fill / Photos / Issues (11–14)
              → View access (15)
                → Dashboards (16)
```

Everything from Phase 2 onward either extends one of these nine steps or depends on them having produced real data to work with.
