import { onRequestError } from './interceptors';

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RequestOptions = {
  method?: RequestMethod;
  headers?: Record<string, string>;
  body?: unknown;
};

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', headers, body } = options;

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed: ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    // 统一把 fetch 异常包装成统一错误（或在拦截器里扩展错误码/鉴权失效处理）
    onRequestError(error);
  }
}
