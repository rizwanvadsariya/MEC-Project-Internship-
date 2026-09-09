# Docs index

The planning documents live at the repo root (they predate the code and are
referenced from `architecture.md`):

| File | Contents |
|---|---|
| [`../PRD.md`](../PRD.md) | Product requirements — problem, roles, workflow, permission matrix, phased features, open questions. |
| [`../schema.md`](../schema.md) | Entity/relationship model — ADP reference data + operational workflow, with the RLS join logic. |
| [`../architecture.md`](../architecture.md) | Tech stack + backend hardening (security, performance, efficiency). |
| [`../phases.md`](../phases.md) | 34-step dependency-ordered build sequence, 9-step critical path. |
| [`../Memory.md`](../Memory.md) | Current implementation status / decision log. |

Executable DDL is `backend/db/migrations/` (the earlier standalone
`app-operational-schema.sql` is superseded by the numbered migrations).
