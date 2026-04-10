import type { Response } from 'express';

const TOKEN_TTL_MS = 60 * 60 * 24 * 7 * 1000;

export function setAuthCookie(res: Response, token: string): void {
  const name = process.env.AUTH_COOKIE_NAME ?? 'trip_auth';
  const secure = process.env.AUTH_COOKIE_SECURE?.toLowerCase() === 'true';

  res.cookie(name, token, {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_TTL_MS,
  });
}

export function clearAuthCookie(res: Response): void {
  const name = process.env.AUTH_COOKIE_NAME ?? 'trip_auth';

  res.clearCookie(name, {
    path: '/',
  });
}
