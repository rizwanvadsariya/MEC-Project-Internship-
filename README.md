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

1. Ensure MongoDB Community Server is running locally, or start the included MongoDB container with `docker-compose up -d mongo`.
2. The local backend configuration in `backend/.env` uses `mongodb://127.0.0.1:27017/smart_me_ecosystem`. For the Docker MongoDB service, use `mongodb://root:changeme@127.0.0.1:27017/smart_me_ecosystem?authSource=admin`. An Atlas URI is also stored as `MONGO_ATLAS_URI`.
3. Install dependencies with `npm install`.
4. Start the backend with `npm run dev:backend` or `npm run start --workspace=backend`.
5. Open MongoDB Compass with the same URI. The backend creates all 16 schema collections after connecting.

To use Atlas, replace `MONGO_URI` in `backend/.env` with the value of `MONGO_ATLAS_URI`, then restart the backend. In Compass, paste the Atlas URI directly into the New Connection field. Ensure the Atlas Network Access rules allow your current IP address.

The API health check is available at `http://localhost:5000/health`.

## Status

Scaffolding stage — folder structure and stub files only, no implementation yet.
