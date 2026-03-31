import type { NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? 'trip_auth';
const IS_PROD = process.env.NODE_ENV === 'production';
// In production, cookie should be `Secure` only when using HTTPS.
// For now (no nginx/https), allow disabling Secure via AUTH_COOKIE_SECURE=false.
const AUTH_COOKIE_SECURE =
  process.env.AUTH_COOKIE_SECURE === undefined
    ? IS_PROD
    : process.env.AUTH_COOKIE_SECURE.toLowerCase() === 'true';
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // keep in sync with jwt.ts

export function getAuthTokenFromRequest(req: NextRequest): string | null {
  return req.cookies.get(AUTH_COOKIE_NAME)?.value ?? null;
}

export function setAuthTokenCookie(res: NextResponse, token: string) {
  res.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: AUTH_COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_TTL_SECONDS,
  });
}

export function clearAuthTokenCookie(res: NextResponse) {
  res.cookies.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: AUTH_COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

