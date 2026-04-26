import { NextResponse } from 'next/server';
import { clearAdminTokenCookie } from '@/server/auth/admin-cookies';

export async function POST() {
  const res = NextResponse.json({ success: true });
  clearAdminTokenCookie(res);
  return res;
}