import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { clearAuthTokenCookie } from '@/server/auth/cookies';

export async function POST(_req: NextRequest) {
  const res = NextResponse.json(null, { status: 204 });
  clearAuthTokenCookie(res);
  res.headers.set('Cache-Control', 'no-store, max-age=0');
  return res;
}

