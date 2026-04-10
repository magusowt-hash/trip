import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { setAuthTokenCookie } from '@/server/auth/cookies';
import { verifyAuthToken } from '@/server/auth/jwt';

function isJsonRequest(req: NextRequest): boolean {
  return (req.headers.get('content-type') || '').includes('application/json');
}

function getOrigin(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  const host = req.headers.get('host') || req.nextUrl.host;
  return `${proto}://${host}`;
}

export async function POST(req: NextRequest) {
  const jsonMode = isJsonRequest(req);
  const origin = getOrigin(req);
  let token = '';

  try {
    if (jsonMode) {
      const body = (await req.json()) as { token?: unknown };
      token = typeof body.token === 'string' ? body.token : '';
    } else {
      const form = await req.formData();
      const t = form.get('token');
      token = typeof t === 'string' ? t : '';
    }
  } catch {
    if (jsonMode) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    return NextResponse.redirect(new URL('/login?error=session', origin), 303);
  }

  if (!token) {
    if (jsonMode) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }
    return NextResponse.redirect(new URL('/login?error=session', origin), 303);
  }

  try {
    const payload = await verifyAuthToken(token);
    const id = Number(payload.sub);
    if (!Number.isFinite(id)) {
      if (jsonMode) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login?error=session', origin), 303);
    }

    if (!jsonMode) {
      const redirectUrl = new URL('/explore', origin);
      const res = NextResponse.redirect(redirectUrl, 303);
      setAuthTokenCookie(res, token);
      res.headers.set('Cache-Control', 'no-store, max-age=0');
      return res;
    }

    const res = NextResponse.json({
      user: { id, phone: payload.phone },
    });
    setAuthTokenCookie(res, token);
    res.headers.set('Cache-Control', 'no-store, max-age=0');
    return res;
  } catch {
    if (jsonMode) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login?error=session', origin), 303);
  }
}
