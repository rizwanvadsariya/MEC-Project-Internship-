/**
 * Maps a caught ApiClientError's machine-readable `code` (backend/src/lib/
 * ApiError.js — INVALID_CREDENTIALS, ACCOUNT_LOCKED, etc.) to a translated
 * message under the `errors` namespace, with a sensible fallback for any
 * unmapped code or a network-level error with no code at all (see
 * api/client.ts — a fetch failure throws with no `code`).
 */
import type { TFunction } from 'i18next';
import { ApiClientError } from '../api/client';

const KNOWN_ERROR_CODES = new Set([
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'ACCOUNT_DEACTIVATED',
  'MFA_REQUIRED',
  'VISIT_REPORT_LOCKED',
  'EMAIL_TAKEN',
  'PROVISION_ROLE_DENIED',
  'PROVISION_DIVISION_DENIED',
  'VISIT_NOT_SCHEDULABLE',
]);

/**
 * `err` is typed loosely (`unknown`) since every call site already does its
 * own `err instanceof ApiClientError ? ... : ...` / `err instanceof Error`
 * branching — this centralizes just the "turn a known code into a translated
 * string" part, callers keep their existing branching shape.
 */
export function translateApiError(t: TFunction, err: unknown, fallback?: string): string {
  if (err instanceof ApiClientError && err.code && KNOWN_ERROR_CODES.has(err.code)) {
    return t(`errors.${err.code}`);
  }
  if (err instanceof ApiClientError && err.message) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback ?? t('errors.generic');
}
