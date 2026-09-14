/** RLS: a SUPPORT_USER cannot INSERT into visit_forms / visit_photos /
 *  issue_reports / comments, and can SELECT only visits for their own teams.
 *  Manually verified live against Supabase (Memory.md "Row-Level Security" —
 *  22/22 checks passed) via a standalone script, not yet ported to Jest. */
'use strict';

test.todo('SUPPORT_USER is blocked from posting a comment; RD can post one');
test.todo('only the LEAD_MEO of a site visit\'s team can insert into visit_forms/visit_photos/issue_reports');
test.todo('a non-lead RD attempting to insert a visit_form gets a real RLS violation, not a silent no-op');

