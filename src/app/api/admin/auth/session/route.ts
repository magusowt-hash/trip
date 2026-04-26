import { NextRequest, NextResponse } from 'next/server';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';

export async function GET(req: NextRequest) {
  const token = getAdminTokenFromRequest(req);

  if (!token) {
    return NextResponse.json({ authenticated: false });
  }

  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const [, timestamp] = decoded.split(':');

    if (!timestamp) {
      return NextResponse.json({ authenticated: false });
    }

    const age = Date.now() - parseInt(timestamp);
    if (age > 7 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ authenticated: false });
    }

    return NextResponse.json({ authenticated: true });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}