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

  STORAGE_BUCKET_VISIT_PHOTOS: z.string().default('visit-photos'),
  STORAGE_BUCKET_ISSUE_PHOTOS: z.string().default('issue-photos'),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),
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
