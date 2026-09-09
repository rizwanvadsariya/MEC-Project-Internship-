/**
 * Server-side Supabase client built with the service_role / secret key
 * (bypasses RLS). Used for auth-admin operations and for issuing signed Storage
 * URLs. This key must never reach the mobile bundle (architecture.md §4.6).
 */
'use strict';

const { createClient } = require('@supabase/supabase-js');
const { config } = require('./index');

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

module.exports = { supabase };
