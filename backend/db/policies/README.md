# RLS policies — readable reference

Row-Level Security is **not applied yet**. It lands as its own numbered migration
(`0004_rls_policies.sql`) together with the auth step (phases.md Step 3–4), once
`auth.uid()` → `users` role/division resolution is wired.

When it does: keep a human-readable copy of every policy here, one section per
table, each stating the role it targets and the exact join condition (see
`schema.md` §5). An RLS policy with no test in
`backend/tests/integration/rls/` is a policy nobody has verified — keep this
file, the migration, and the tests in sync.

Until then the backend connects as the `postgres` pooler role (which bypasses
RLS), so the API is the only enforcement layer.
