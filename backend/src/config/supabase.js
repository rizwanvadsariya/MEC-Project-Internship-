/**
 * Server-side Supabase client built with the service_role / secret key
 * (bypasses RLS). Used for auth-admin operations and for issuing signed Storage
 * URLs. This key must never reach the mobile bundle (architecture.md §4.6).
 */
'use strict';

const { createClient } = require('@supabase/supabase-js');
const { config } = require('./index');

const serviceRoleOptions = {
  auth: { autoRefreshToken: false, persistSession: false },
};

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, serviceRoleOptions);
// Auth login uses the client session state. Storage must keep an independent
// service-role authorization header for uploads and signed URLs.
const storageSupabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, serviceRoleOptions);

module.exports = { supabase, storageSupabase };
