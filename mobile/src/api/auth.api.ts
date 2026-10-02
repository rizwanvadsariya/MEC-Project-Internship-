/** login, forgot-password, current-user profile — mirrors backend/src/api/v1/routes/auth.routes.js. */
import { apiRequest } from './client';

export type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  role: 'REGIONAL_DIRECTOR' | 'DIRECTOR_GENERAL' | 'MEO' | 'SUPPORT_USER';
  divisionId: number | null;
  divisionIds: number[];
  departmentId: number | null;
  isActive: boolean;
};

export type DivisionAssignmentData = {
  directors: { id: string; fullName: string; email: string; divisionId: number; divisionIds: number[] }[];
  divisions: { id: number; name: string }[];
};

export type ProvisionedUser = {
  profile: AuthUser;
  inviteLink: string | null;
};

type LoginResponse = {
  session: { access_token: string; refresh_token: string };
  user: { id: string; email: string };
};

export function login(email: string, password: string) {
  return apiRequest<LoginResponse>('/auth/login', { method: 'POST', body: { email, password } });
}

export function fetchMe(token: string) {
  return apiRequest<AuthUser>('/auth/me', { token });
}

export function getDivisionAssignments(token: string) {
  return apiRequest<DivisionAssignmentData>('/auth/division-assignments', { token });
}

export function assignRdDivisions(token: string, userId: string, divisionIds: number[]) {
  return apiRequest<AuthUser>(`/auth/users/${userId}/divisions`, {
    method: 'PATCH',
    token,
    body: { divisionIds },
  });
}

export function forgotPassword(email: string) {
  return apiRequest<{ message: string }>('/auth/forgot-password', { method: 'POST', body: { email } });
}

export function provisionUser(token: string, input: { fullName: string; email: string; phone?: string; role: 'MEO' | 'SUPPORT_USER'; divisionIds: number[] }) {
  return apiRequest<ProvisionedUser>('/auth/users', {
    method: 'POST',
    token,
    body: input,
  });
}
