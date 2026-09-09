/**
 * One-off connectivity check:  node scripts/check-db.js
 * Prints the Postgres version + current DB and a Supabase Storage round-trip,
 * then exits. Use this right after filling in backend/.env.
 */
'use strict';

const { pool } = require('../src/config/database');
const { supabase } = require('../src/config/supabase');

(async () => {
  const { rows } = await pool.query(
    'select version() as version, current_database() as db, current_user as usr',
  );
  console.log('✅ Postgres connected');
  console.log('   ', rows[0].version.split(',')[0]);
  console.log('    database =', rows[0].db, ' user =', rows[0].usr);

  const { data, error } = await supabase.storage.listBuckets();
  if (error) {
    console.log('⚠️  Supabase Storage call failed:', error.message);
  } else {
    console.log('✅ Supabase client OK — buckets:', data.map((b) => b.name).join(', ') || '(none yet)');
  }

  await pool.end();
})().catch((err) => {
  console.error('❌ FAILED:', err.message);
  process.exit(1);
});
