/**
 * login, provisioning, forgot-password, and session-revoke request shapes.
 * `provisionUser` mirrors the DB's own CHECK constraint on `users`
 * (division required unless SUPPORT_USER) — hardening point #3, defense in
 * depth: reject a malformed request here, before it ever reaches Supabase or
 * Postgres, rather than relying on the constraint alone to catch it.
 */
'use strict';

const { z } = require('zod');
const { ROLES } = require('../constants/roles');

const roleEnum = z.enum(Object.values(ROLES));

const login = {
  body: z.object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1, 'Password is required'),
  }),
};

const forgotPassword = {
  body: z.object({
    email: z.string().trim().toLowerCase().email(),
  }),
};

const provisionUser = {
  body: z
    .object({
      email: z.string().trim().toLowerCase().email(),
      fullName: z.string().trim().min(1).max(200),
      phone: z.string().trim().max(30).optional(),
      role: roleEnum,
      divisionId: z.coerce.number().int().positive().optional(),
      departmentId: z.coerce.number().int().positive().optional(),
    })
    .refine((v) => v.role === ROLES.SUPPORT_USER || v.divisionId != null, {
      message: 'divisionId is required unless role is SUPPORT_USER',
      path: ['divisionId'],
    }),
};

const userIdParam = {
  params: z.object({ id: z.string().uuid() }),
};

const sessionIdParam = {
  params: z.object({ sessionId: z.string().uuid() }),
};

module.exports = { login, forgotPassword, provisionUser, userIdParam, sessionIdParam };
