-- ============================================================================
--  0014  Issue escalation tracking                                (phases.md Step 25)
--
--  Two escalation rules land in this step (see Memory.md "Step 25" for the
--  full rationale):
--   1. A CRITICAL issue notifies division leadership (RD+DG) the instant it's
--      filed — a pure notification-side bypass of the normal "wait until the
--      report is submitted" flow (Step 15). Read access to the underlying
--      draft issue is untouched; the notification text itself is the
--      escalation (this app has no notification deep-linking anywhere yet).
--      No schema change needed for this rule — it's a new notification.service
--      trigger fired from issue.service.file().
--   2. Any issue whose due_date has passed while still unresolved escalates
--      to the division's DG. Since this project has no cron/queue infra
--      (architecture.md §6 — everything is request-triggered fire-and-forget),
--      this is checked lazily whenever the division dashboard loads
--      (dashboard.service.getDivisionSummary, hit by both RD and DG). The
--      escalated_at column below makes each issue escalate exactly once, not
--      on every dashboard load.
-- ============================================================================

alter table issue_reports add column escalated_at timestamptz;

-- Partial index: only ever queried for issues that are still eligible to
-- escalate (unresolved, not yet escalated, past due) — a full index on
-- due_date would carry rows this query never touches.
create index issue_reports_pending_escalation_idx on issue_reports (due_date)
  where escalated_at is null and status <> 'RESOLVED';
