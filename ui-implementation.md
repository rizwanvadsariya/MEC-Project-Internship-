# UI Implementation Guide

## Smart Provincial M&E Management Ecosystem — Mobile App

This document defines the visual design system and screen-level UI requirements for the React Native app. It complements `architecture.md` (backend/system design) and `phases.md` (build order) — this file is the UI counterpart, covering *how the app should look and feel*, not how it's built underneath.

---

## 1. Design system

### 1.1 Color palette — light green + white theme

A single theme/tokens file (`src/theme/colors.js`) is the source of truth; no screen hardcodes a color directly.

| Token | Hex | Used for |
|---|---|---|
| `primary` | `#4CAF50` | Buttons, active states, icons |
| `primaryLight` | `#A5D6A7` | Cards, highlights, chips |
| `primaryDark` | `#2E7D32` | Headers, emphasis text, pressed states |
| `background` | `#FFFFFF` | Screen backgrounds |
| `surface` | `#F1F8F2` | Cards, input fields (very light green-white) |
| `border` | `#C8E6C9` | Dividers, input borders |
| `textPrimary` | `#1B2E1E` | Main text |
| `textSecondary` | `#5C7A60` | Secondary/muted text |
| `error` | `#D32F2F` | Error states, validation messages |
| `warning` | `#F9A825` | Warnings, pending states |
| `success` | `#388E3C` | Success confirmations, approved states |

### 1.2 Typography & spacing

Matching scales live in the same `src/theme/` folder (font sizes, weights, line heights; spacing units) so every screen pulls from one shared scale rather than picking its own values per screen.

---

## 2. Login screen

The one screen with a distinct visual treatment — everything else follows §3.

- **Background**: a full-screen image behind the login form, at low opacity (~10–15%), tinted toward the green theme (a green overlay on the image, or a green-toned image itself — development/infrastructure/agriculture themed fits the app's subject matter).
- **Animation**: the background image crossfades to a different image every several seconds, in a continuous loop, using **Moti** (built on `react-native-reanimated`) — not Framer Motion, which is a web/DOM library and doesn't run in React Native.
- **Foreground**: the login form (email/password fields, login button) sits fully opaque on top, styled from `surface`/`primary` tokens, unaffected by the background animation.
- **Tone**: the animation stays subtle and slow — a slow crossfade, not anything distracting. This is a government monitoring app's login screen, not a marketing page.
- **Open decision**: whether the background is a real sourced photo or an abstract/generated graphic — see §6.

No Sign Up UI on this screen or anywhere else in the app — accounts are provisioned by DG/RD per the auth plan, not self-service (see `Memory.md` decision log).

---

## 3. Every other screen — consistent, smooth UI

All non-login screens share one visual language and one navigation feel:

- **Transitions**: configured once, globally, in the React Navigation navigator — not per-screen. One shared slide/fade config governs every route change, so moving through the app feels like one connected product.
- **Shared components**: spacing, card styles, header styles, and button styles all come from the theme file — no one-off styling per screen.
- **Loading/empty states**: one consistent pattern app-wide (e.g. a single skeleton-loader or fade-in style), not a different spinner per screen.

### Screen inventory

| Screen | Primary user(s) | Notes |
|---|---|---|
| Login | All roles | Per §2 |
| Role-based home/dashboard | RD, DG, MEO, Support | Same visual language, different widgets per role; division-scoped for RD/DG |
| Scheme browser | All roles | Search/filter list against pre-loaded ADP scheme data |
| Team assembly | RD | Build a visit team: lead MEO + supporting members |
| DG approval queue | DG | Approve/reject proposed teams |
| My Tasks / assigned visits | MEO, Support | Visits the user is a team member on |
| Visit form | MEO (lead) | Dynamic, sector-specific fields (§ per `schema.md`'s `form_templates`) |
| Photo capture/upload | MEO (lead) | Tied to a site visit |
| Issue reporting | MEO (lead) | Type, severity, description |
| View-only visit record | Support, other team members | Form/photos/issues, read-only |
| Notifications | All roles | Team approved/rejected, issue filed, visit completed |
| Profile/settings | All roles | |

This list tracks the Phase 1 feature set in `phases.md` — as new functionality lands in later phases, add its screen here rather than letting the UI spec drift out of sync with the roadmap.

---

## 4. Tech notes

- **Navigation**: React Navigation, with transition options set globally on the navigator.
- **Animation**: Moti (`react-native-reanimated` under the hood) for the login background; the same library is the natural choice for any other in-app motion (e.g. status-change animations, skeleton loaders) so the app isn't carrying two animation libraries.
- **Styling**: whatever styling approach is already established in the repo (StyleSheet or an installed styling library) — this spec defines tokens and behavior, not a new styling framework to adopt.

---

## 5. Open decisions

1. **Login background: real photo vs. abstract/generated graphic.** A real photo needs sourcing (construction sites, infrastructure, farmland); an abstract pattern/gradient can be generated with no sourcing step. Not yet decided.
2. **Number and theme of the rotating background images** — depends on the decision above.

---

## 6. Companion documents

- `PRD.md` — the roles and workflow this UI serves
- `architecture.md` — backend/system design
- `phases.md` — build order; screens here should match what's actually scoped per phase
- `Memory.md` — decision log, including the no-signup-screen decision referenced in §2
