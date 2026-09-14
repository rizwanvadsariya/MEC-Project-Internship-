/** TOTP MFA enroll/challenge/verify/list/unenroll — mirrors
 *  backend/src/api/v1/routes/auth.routes.js's /auth/mfa/* routes. All proxied
 *  through the backend; this app never talks to Supabase directly. */
import { apiRequest } from './client';

export type EnrolledFactor = {
  id: string;
  type: 'totp';
  totp: { qr_code: string; secret: string; uri: string };
};

export type MfaFactor = {
  id: string;
  status: 'verified' | 'unverified';
  factor_type: string;
  created_at: string;
};

export function enroll(token: string) {
  return apiRequest<EnrolledFactor>('/auth/mfa/enroll', { method: 'POST', token });
}

export function challenge(token: string, factorId: string) {
  return apiRequest<{ id: string; expires_at: number }>('/auth/mfa/challenge', {
    method: 'POST',
    token,
    body: { factorId },
  });
}

export function verify(token: string, factorId: string, challengeId: string, code: string) {
  return apiRequest<{ session: { access_token: string; refresh_token: string } }>('/auth/mfa/verify', {
    method: 'POST',
    token,
    body: { factorId, challengeId, code },
  });
}

export function listFactors(token: string) {
  return apiRequest<{ all: MfaFactor[] }>('/auth/mfa/factors', { token });
}

export function unenroll(token: string, factorId: string) {
  return apiRequest<{ message: string }>(`/auth/mfa/factors/${factorId}`, { method: 'DELETE', token });
}
