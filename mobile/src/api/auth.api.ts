/** login, forgot-password, current-user profile — mirrors backend/src/api/v1/routes/auth.routes.js. */
import { apiRequest } from './client';

export type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  role: 'REGIONAL_DIRECTOR' | 'DIRECTOR_GENERAL' | 'MEO' | 'SUPPORT_USER';
  divisionId: number | null;
  departmentId: number | null;
  isActive: boolean;
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

export function forgotPassword(email: string) {
  return apiRequest<{ message: string }>('/auth/forgot-password', { method: 'POST', body: { email } });
}
