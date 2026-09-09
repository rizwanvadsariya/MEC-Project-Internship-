/**
 * DG approve/reject: write a new append-only team_approval_requests row, flip visit_teams.status, trigger site-visit creation on APPROVE.
 * Business logic only — no HTTP objects, no raw SQL. Calls repositories/ for
 * data and other services/ for cross-cutting actions. Unit-testable in isolation.
 */
'use strict';
module.exports = {};
