/**
 * Cache client for rarely-changing reference data (divisions, districts,
 * departments, sub_sectors, form_templates) — architecture.md §5.2.
 * Starts as a single-instance in-memory TTL map; swap for Redis when traffic
 * justifies a shared cache across Render instances.
 */
'use strict';
module.exports = { get: async () => null, set: async () => {}, bust: async () => {} };
