/** Validation for the read-only scheme browser query and detail routes. */
'use strict';

const { z } = require('zod');

const positiveInt = z.coerce.number().int().positive();

// Wrapped under `query` — validate() reads schemas.query/.params/.body per
// part; an unwrapped schema here would be silently skipped (schemas.query
// would be undefined), which is exactly what let this list go unvalidated.
const query = {
  query: z.object({
    search: z.string().trim().max(120).optional(),
    divisionId: positiveInt.optional(),
    districtId: positiveInt.optional(),
    departmentId: positiveInt.optional(),
    subSectorId: positiveInt.optional(),
    status: z.string().trim().max(80).optional(),
    cursor: z.string().regex(/^\d+$/).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
};

const idParam = { params: z.object({ id: positiveInt }) };

// Step 28 — a scanned QR code's raw text, or a manually retyped scheme uid
// (e.g. "AGRAE-PP-16-0003"). Deliberately lenient (no format regex) — the
// exact-match lookup itself in scheme.repo.findByUid is what determines
// whether it's a real scheme, not validation here.
const uidParam = { params: z.object({ uid: z.string().trim().min(1).max(100) }) };

module.exports = { query, idParam, uidParam };
