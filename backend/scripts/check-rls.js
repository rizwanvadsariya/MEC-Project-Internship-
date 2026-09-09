/** Smoke-checks that RLS is ENABLED on every table that should have it, and that
 *  a low-privilege connection is actually denied a cross-division read. Fails the
 *  build if a table is unexpectedly world-readable. */
'use strict';
