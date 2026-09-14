/**
 * Thin fetch wrapper: base URL from app.json's `extra.apiBaseUrl`, attaches
 * the bearer token, parses the backend's { data } / { error } envelope
 * (backend/src/lib/ApiResponse.js + errorHandler.js) into a typed result or
 * a thrown ApiClientError carrying the server's message/code.
 */
import Constants from 'expo-constants';

const BASE_URL: string = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl
  ?? 'http://localhost:4000/api/v1';

export class ApiClientError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
};

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = opts;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Fetch itself failed — no response at all (host unreachable, wrong IP,
    // firewall, etc.). Surface a clear message instead of a cryptic "Network
    // request failed" so it's obvious what to check.
    throw new ApiClientError(
      0,
      `Could not reach the API at ${BASE_URL}. Check the phone and computer are on the same Wi-Fi and the backend is running.`,
    );
  }

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const message = json?.error?.message ?? `Request failed (${res.status})`;
    throw new ApiClientError(res.status, message, json?.error?.code, json?.error?.details);
  }

  return json?.data as T;
}

export const apiBaseUrl = BASE_URL;
