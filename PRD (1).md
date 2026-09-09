# Product Requirements Document

## Smart Provincial M&E Management Ecosystem — Scheme Monitoring App

| | |
|---|---|
| **Status** | Draft v1.0 |
| **Prepared for** | Sindh Secretariat — Provincial Project Monitoring & Evaluation |
| **Project team** | Muhammad Ali Hadi (Full Stack Developer), Muhammad Mustafa, Rizwan Vadsariya |
| **Platform** | Mobile app (React Native) — PERN stack |

---

## 1. Overview

The Smart Provincial M&E Management Ecosystem is a monitoring platform that lets the Sindh Secretariat track the real-world progress of development schemes already approved and funded under the province's Annual Development Programme (ADP). It comprises three logical pieces — **SIMS** (Scheme Information Management System, the scheme reference data), **PMS** (Project Monitoring System, the field-visit workflow this PRD focuses on), and a **Finance Dashboard** — but this document scopes the mobile monitoring app that sits at the center of PMS: assigning field teams, routing them through approval, and capturing what they find on-site.

Today, tracking a scheme's real-world progress against its ADP book entry is a manual, paper- and phone-call-driven process spread across departments. This app puts scheme lookup, team assignment, DG approval, site-visit reporting, and issue escalation into a single mobile-first platform so every role — Regional Director, Director General, Monitoring & Evaluation Officer (MEO), and supporting field staff — works from the same live record.

## 2. Problem statement

- Scheme progress data (photos, physical completion %, on-ground issues) is not centrally captured, making it hard for the Director General or Regional Directors to verify claimed progress against ADP-book figures.
- There's no structured, auditable approval trail for who is authorized to visit and report on a given scheme.
- Field reports (when they exist) aren't tied to a consistent data model, making cross-division or cross-department comparison difficult.
- Issues found on-site (construction defects, delays, safety concerns) have no formal reporting or escalation path.

## 3. Goals

1. Give every Regional Director and Director General a live, division-scoped view of scheme progress instead of relying on manual reporting.
2. Enforce a clear, auditable chain of custody for who visited a scheme, when, and under whose approval.
3. Standardize how field progress is captured (photos, structured forms, issue reports) across all sectors — infrastructure, health, education, and others — while allowing sector-specific checklist fields.
4. Surface on-site issues to the right people quickly, instead of them getting lost in informal channels.

### Non-goals (explicitly out of scope for this app)

- **Creating or registering new schemes.** The app works only against schemes that already exist in the system, seeded from the official Sindh Government ADP booklet. There is no "add scheme/project" feature anywhere in the product.
- Replacing the ADP budgeting/approval process itself (that happens upstream, in the Finance Dashboard / planning process, not this app).
- Public-facing transparency features (this is an internal secretariat tool, not a citizen-facing portal) — not ruled out for the future, but not part of this PRD.

## 4. Users & roles

| Role | Who they are | Core responsibility in the app |
|---|---|---|
| **Regional Director (RD)** | Oversees schemes within their division | Assembles visit teams; submits them for DG approval; can include themself on a team |
| **Director General (DG)** | Approves team assignments; highest authority | Reviews and approves/rejects RD-proposed teams; full visibility within scope |
| **MEO (lead)** | Monitoring & Evaluation Officer, does the fieldwork | Visits the scheme site, takes photos, fills the progress form, files issue reports |
| **Support user** | Supporting MEOs, other-department staff who accompany the lead MEO | Strictly view-only: sees the form, photos, and issues filed for visits they're part of |

## 5. Scope of scheme visibility

- **RD and DG visibility is scoped to their own division**, not province-wide. A Regional Director or Director General only sees schemes, teams, and visits belonging to their division.
- **Support users** have strict view-only access — no commenting, no editing, and access is limited to visits they were assigned to as a team member.
- Sindh has **6 divisions**; every scheme, team, and visit is attributable to a division (derived from the scheme's district).

## 6. Core workflow

**Step 1 — Team assembly.** For a scheme requiring a visit, the RD assembles a team: exactly one lead MEO, any number of supporting MEOs, any number of other-department workers, and optionally the RD themself.

**Step 2 — DG approval.** The RD submits the team to the DG.
- If the DG **rejects** it, the RD revises the team composition and resubmits — this loop repeats until approved. Every submission is retained as an auditable record (who submitted, when, DG's decision, remarks).
- If the DG **approves** it, the team is locked in for that scheme visit.

**Step 3 — Site visit.** The lead MEO visits the site and:
- Takes progress photos
- Fills a structured progress form (physical progress %, remarks, and sector-specific fields depending on the scheme's department — e.g. infrastructure vs. health vs. education checklists differ)
- Files an issue report if a problem is found (type, severity, description)

**Step 4 — View access.** Once the visit record exists, all other team members (supporting MEOs, other-department workers, the RD if included) get **view-only** access to that visit's form, photos, and issues. The RD and DG retain full visibility into all visits within their division regardless of team membership.

## 7. Role → permission matrix

| Action | Regional Director | Director General | Lead MEO | Support user |
|---|---|---|---|---|
| View schemes & progress (own division) | ✅ | ✅ | ✅ (browse, read-only) | ✅ (browse, read-only) |
| Assemble / edit a visit team | ✅ | ❌ | ❌ | ❌ |
| Add self to the team | ✅ optional | — | — | — |
| Submit team for DG approval | ✅ | ❌ | ❌ | ❌ |
| Approve / reject a team | ❌ | ✅ | ❌ | ❌ |
| Revise & resubmit a rejected team | ✅ | ❌ | ❌ | ❌ |
| Fill / edit the visit form | ❌ | ❌ | ✅ | ❌ |
| Upload progress photos | ❌ | ❌ | ✅ | ❌ |
| File an issue report | ❌ | ❌ | ✅ | ❌ |
| View form, photos, issues for their team's visit | ✅ | ✅ | ✅ | ✅ (view-only) |
| Comment / discuss on a scheme or visit | ✅ | ✅ | ✅ | ❌ |
| Create a new scheme | ❌ | ❌ | ❌ | ❌ |

## 8. Functional requirements — phased roadmap

### Phase 1 — Core MVP

- Auth & role-based login (Supabase Auth), with division/department assigned at signup
- Scheme browser — search/filter existing, pre-loaded scheme data by division, district, department, sub-sector, and status
- Team assembly flow for RDs
- DG approval queue (approve/reject with remarks; resubmission loop)
- Site visit creation, auto-enabled once a team is approved
- Visit form with physical progress %, remarks, and sector-specific dynamic fields
- Photo capture/upload tied to a visit
- Issue reporting (type, severity, description)
- Division-scoped dashboards for RD/DG; strict view-only screens for support users

### Phase 2 — Usability & day-to-day operations

- Push + in-app notifications (team approved/rejected, new issue filed, visit completed)
- Offline mode for MEOs — forms/photos queue locally and sync when back online
- GPS geo-tagging on photos/visit check-in, to confirm the MEO was on-site
- Comments/discussion thread per scheme or visit (RD, DG, MEO only — support users excluded)
- Visit scheduling calendar for RD / lead MEO
- Multi-language UI (Urdu / Sindhi / English)
- Basic analytics — progress % by division, by department, scheme status breakdown

### Phase 3 — Monitoring & accountability

- Issue lifecycle tracking (open → acknowledged → in progress → resolved), with owner and due date
- Escalation rules — e.g. a `CRITICAL` issue auto-notifies the DG regardless of who's on the team
- Full audit trail of who approved/rejected/edited what and when
- Physical vs. financial progress reconciliation — cross-check MEO-reported progress against the ADP booklet's financial-progress figures to surface mismatches
- QR scan-to-open — scanning a scheme's printed ADP-booklet QR code opens its record directly
- PDF/Excel export for offline reporting

### Phase 4 — Advanced / province-wide intelligence

- GIS map view of schemes across divisions/districts, color-coded by progress or issue severity
- Delay/anomaly detection (no visit in X months, spend-without-progress patterns)
- Automated digest reports (weekly/monthly, scoped to each DG's and RD's division)
- Predictive risk flagging for schemes likely to miss their target completion date
- Custom KPI dashboards per role, same underlying data, different scope

## 9. Non-functional requirements

| Category | Requirement |
|---|---|
| **Data source integrity** | Scheme master data is seeded from the official ADP booklet and is not user-editable through scheme-creation; any correction path is a separate, controlled process outside this app's initial scope (see open question in §12) |
| **Access control** | Enforced at both the application layer and the database layer (Postgres Row-Level Security via Supabase), scoped by division and by team membership |
| **Auditability** | Every team submission, DG decision, and visit record is timestamped and attributable to a user; nothing is silently overwritten |
| **Performance** | Scheme list and dashboard views should load within a few seconds even as scheme counts scale into the thousands (the source ADP booklet alone lists 3,700+ schemes province-wide) |
| **Offline resilience** | Field data capture (Phase 2) must not be blocked by poor connectivity at remote scheme sites |
| **Localization** | Urdu and Sindhi language support planned for Phase 2, alongside English |
| **Scalability** | Must support concurrent use across all 6 divisions without cross-division data leakage |

## 10. Technical architecture (summary)

| Layer | Choice |
|---|---|
| Database | PostgreSQL, hosted on Supabase |
| Backend | Node.js + Express.js |
| Frontend (mobile) | React Native |
| Frontend hosting | Vercel |
| Backend hosting | Render |

Supporting technical artifacts already produced for this project:
- `schema.md` — entity/relationship model for the ADP booklet master reference data (departments, sub-sectors, schemes, districts, funding sources, SDG tags)
- `app-operational-schema.sql` — PostgreSQL DDL for the operational side of the app (users, team assembly, DG approval workflow, site visits, dynamic sector-aware forms, photos, issue reports, comments)

## 11. Success metrics

- % of approved, in-progress schemes with at least one recorded site visit per quarter, by division
- Median time from team submission to DG decision
- Median time from team approval to first site visit
- Issue resolution time (open → resolved)
- Active user adoption rate (RDs/MEOs actively logging visits vs. total assigned)
- Reduction in schemes with no monitoring activity for 6+ months

## 12. Open questions

1. **Scheme master-field editability.** "No scheme creation" is confirmed — but is the `schemes` table (cost, target completion date, etc.) fully read-only within the app, with corrections only possible via a controlled re-seed from the next ADP booklet? Or should RD/DG have limited edit rights on specific fields? This affects the RLS policy design and needs to be settled before Phase 1 permissions are finalized.
2. **Frontend deployment shape.** The stack lists React Native (mobile) with frontend deployment on Vercel — worth clarifying whether this means a separate web-based admin dashboard (React, not Native) alongside the mobile app, or a React Native Web build served from Vercel, since the two imply different codebases and role coverage.
3. **Support user comment restriction re-check.** Confirmed as view-only for this version — flagging only because it's a common ask to revisit once the app is in pilot use and support users want to flag something without going through the lead MEO.

## 13. Glossary

| Term | Meaning |
|---|---|
| **ADP** | Annual Development Programme — the Sindh Government's official scheme budget book, the source of all scheme master data |
| **SIMS** | Scheme Information Management System — the reference-data layer (schemes, departments, financials) |
| **PMS** | Project Monitoring System — the team-assembly, approval, and site-visit workflow this app implements |
| **RD** | Regional Director |
| **DG** | Director General |
| **MEO** | Monitoring & Evaluation Officer (fieldwork role; previously referred to internally as FMO) |
| **UID** | Unique scheme identifier as printed in the ADP booklet (e.g. `AGRAE-PP-16-0003`) |
| **Division** | One of Sindh's 6 top-level administrative groupings of districts |
