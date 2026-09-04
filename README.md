# Smart Provincial M&E Management Ecosystem

A unified digital platform for scheme information management (SIMS), field
monitoring (PMS), and financial oversight, connected by a Variance Engine
that cross-checks financial expenditure against verified physical progress.

See the project proposal document for full background, objectives, and
scope. This repository is organized as:

- `shared/`  — TypeScript types and constants shared between backend and mobile
- `backend/` — Node.js + Express REST API, MongoDB, Redis, S3-compatible storage
- `mobile/`  — React Native (bare workflow) role-adaptive mobile application

## Getting started

1. Copy `backend/.env.example` to `backend/.env` and fill in values.
2. Start local infrastructure: `docker-compose up -d`
3. Install dependencies in `backend/` and `mobile/`.
4. See each subfolder for its own setup notes.

## Status

Scaffolding stage — folder structure and stub files only, no implementation yet.
