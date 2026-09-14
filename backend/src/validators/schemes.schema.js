/** Validation for the read-only scheme browser query and detail routes. */
'use strict';

const { z } = require('zod');

const positiveInt = z.coerce.number().int().positive();

const query = z.object({
  search: z.string().trim().max(120).optional(),
  divisionId: positiveInt.optional(),
  districtId: positiveInt.optional(),
  departmentId: positiveInt.optional(),
  subSectorId: positiveInt.optional(),
  status: z.string().trim().max(80).optional(),
  cursor: z.string().regex(/^\d+$/).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const idParam = { params: z.object({ id: positiveInt }) };

module.exports = { query, idParam };
