import { onRequestError } from './interceptors';

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RequestOptions = {
  method?: RequestMethod;
  headers?: Record<string, string>;
  body?: unknown;
};

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

function getAuthToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/trip_auth=([^;]+)/);
  return match ? match[1] : null;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', headers, body } = options;
  const start = Date.now();

  const token = getAuthToken();
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  const fullUrl = `${BASE_URL}${path}`;

  try {
    const response = await fetch(fullUrl, {
      method,
      headers: {
        ...requestHeaders,
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      credentials: 'include',
    });

    if (!response.ok) {
      let errorText = `Request failed: ${response.status}`;
      try {
        const data = await response.json();
        errorText = data.error || errorText;
      } catch {
        // ignore
      }
      throw new Error(errorText);
    }

    const result = await response.json() as T;
    const elapsed = Date.now() - start;
    if (elapsed > 500) {
      console.warn(`[PERF] ${method} ${path}: ${elapsed}ms`);
    }
    return result;
  } catch (error) {
    onRequestError(error);
  }
}
