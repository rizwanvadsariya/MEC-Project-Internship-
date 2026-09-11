/**
 * append-only audit_log writes (architecture.md §4.8, hardening point #4).
 * The ONLY layer that talks to Postgres/Supabase.
 */
'use strict';

const { query } = require('../config/database');

/** Insert one audit row. Never throws into the caller's happy path — logging
 *  a security event failing must not itself break a request — but it does
 *  reject so the caller can decide (auth flows await it deliberately, since a
 *  silently-lost provisioning record defeats the point of auditing). */
async function record({ actorId = null, action, entityType = null, entityId = null, metadata = null }) {
  await query(
    `insert into audit_log (actor_id, action, entity_type, entity_id, metadata)
     values ($1, $2, $3, $4, $5)`,
    [actorId, action, entityType, entityId, metadata ? JSON.stringify(metadata) : null],
  );
}

module.exports = { record };
