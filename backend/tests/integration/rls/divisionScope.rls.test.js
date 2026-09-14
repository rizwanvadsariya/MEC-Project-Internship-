/** RLS: a direct DB connection as an RD in division A is denied SELECT on
 *  division B rows even when the API layer is bypassed (architecture.md §6).
 *  Manually verified live against Supabase (Memory.md "Row-Level Security" —
 *  22/22 checks passed) via a standalone script, not yet ported to Jest. */
'use strict';

test.todo('RD/DG/MEO see schemes only in their own division; SUPPORT_USER browses all (open read)');
test.todo('users table: RD/DG see users in their own division; SUPPORT_USER sees only themself');
test.todo('visit_teams/site_visits: RD/DG see their division, team members see their own team, no cross-division leak');
test.todo('anon role gets zero rows from any table');

