import type { NextRequest, NextResponse } from 'next/server';

const ADMIN_COOKIE_NAME = process.env.ADMIN_COOKIE_NAME ?? 'trip_admin';
const ADMIN_COOKIE_SECURE = process.env.ADMIN_COOKIE_SECURE?.toLowerCase() === 'true';
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

export function getAdminTokenFromRequest(req: NextRequest): string | null {
  return req.cookies.get(ADMIN_COOKIE_NAME)?.value ?? null;
}

export function setAdminTokenCookie(res: NextResponse, token: string) {
  res.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: false,
    secure: ADMIN_COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_TTL_SECONDS,
  });
}

export function clearAdminTokenCookie(res: NextResponse) {
  res.cookies.set(ADMIN_COOKIE_NAME, '', {
    httpOnly: false,
    secure: ADMIN_COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}