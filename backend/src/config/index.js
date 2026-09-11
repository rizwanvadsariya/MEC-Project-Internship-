/**
 * Loads environment variables once, validates them, and exports a frozen
 * `config` object. Fails fast on startup with a readable message if anything
 * required is missing or still a REPLACE_ME placeholder (architecture.md §4.6).
 */
'use strict';

const path = require('path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const csv = (v) =>
  (v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// z.coerce.boolean() would turn the STRING "false" into `true` (Boolean("false")
// is truthy) — this actually reads "true"/"false" as words.
const boolFromEnv = (def) =>
  z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() === 'true' : v), z.boolean()).default(def);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.string().default('info'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_JWKS_URL: z.string().url(),

  DATABASE_URL: z.string().startsWith('postgres'),
  DIRECT_URL: z.string().startsWith('postgres').optional(),

  CORS_ORIGINS: z.string().default(''),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX_READ: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_MAX_WRITE: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_MAX_AUTH: z.coerce.number().int().positive().default(10),
  // Tighter than RATE_LIMIT_MAX_WRITE and tracked separately from login
  // (hardening point #5 vs #8 — account creation abuse and credential
  // guessing are different threats with different right-sized limits).
  RATE_LIMIT_MAX_PROVISION: z.coerce.number().int().positive().default(5),

  STORAGE_BUCKET_VISIT_PHOTOS: z.string().default('visit-photos'),
  STORAGE_BUCKET_ISSUE_PHOTOS: z.string().default('issue-photos'),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  // ---- Auth hardening (Memory.md "Planned: Supabase Auth setup") ----------
  // MFA (point #7) is enforced only once this is flipped to true. It defaults
  // to false because there is no mobile enrollment screen yet — turning it on
  // before that exists would lock every DG/RD out with no way back in.
  MFA_ENFORCEMENT_ENABLED: boolFromEnv(false),
  // Login lockout (point #8) — separate from the provisioning rate limit.
  LOGIN_LOCKOUT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  // Deep links the invite email / password-reset email send the user to
  // (point #1, #10). Mobile app.json declares the `mec://` scheme.
  INVITE_REDIRECT_URL: z.string().default('mec://auth/accept-invite'),
  PASSWORD_RESET_REDIRECT_URL: z.string().default('mec://auth/reset-password'),
});

// Surface the "you haven't finished .env yet" case with a clear message rather
// than a raw zod dump.
const placeholders = Object.entries(process.env)
  .filter(([, v]) => typeof v === 'string' && v.includes('REPLACE_ME'))
  .map(([k]) => k);

if (placeholders.length) {
  // eslint-disable-next-line no-console
  console.error(
    `\n[config] These backend/.env values are still placeholders:\n` +
      placeholders.map((k) => `  - ${k}`).join('\n') +
      `\n\nFill them from the Supabase dashboard (Settings → API and Settings → Database),\n` +
      `then re-run. See backend/README.md → "Connecting Supabase".\n`,
  );
  process.exit(1);
}

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('[config] Invalid environment:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const config = Object.freeze({
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isDev: parsed.data.NODE_ENV === 'development',
  corsOrigins: csv(parsed.data.CORS_ORIGINS),
});

module.exports = { config };
