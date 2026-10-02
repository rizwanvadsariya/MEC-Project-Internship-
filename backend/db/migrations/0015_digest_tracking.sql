-- ============================================================================
--  0015  Digest-report tracking                                   (phases.md Step 32)
--
--  Automated digest reports (weekly/monthly, scoped per DG/RD division),
--  combining Step 17's notification infrastructure with Step 23's analytics
--  (phases.md's own framing — see Memory.md "Step 32" for the full
--  rationale). Since this project has no cron/queue infrastructure
--  (architecture.md §6 — a real scheduled job would need a deployment
--  guarantee, like a single always-on instance, this app doesn't have), a
--  digest is checked lazily whenever an RD/DG loads their division
--  dashboard (dashboard.service.getDivisionSummary — the exact same hook
--  point Step 25's overdue-issue escalation already uses), not on a real
--  calendar timer. These two columns make each digest fire at most once per
--  real elapsed week/month, never duplicated across repeated dashboard
--  loads, the same role migration 0014's escalated_at plays for issues.
-- ============================================================================

alter table users add column last_weekly_digest_at timestamptz;
alter table users add column last_monthly_digest_at timestamptz;
