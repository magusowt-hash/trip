import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { verifyPassword } from '@/server/auth/password';
import { signAuthToken } from '@/server/auth/jwt';
import { setAuthTokenCookie } from '@/server/auth/cookies';

function normalizePhone(input: string): string {
  const trimmed = input.trim();
  const compact = trimmed.replace(/[\s-]/g, '');
  return compact;
}

function isValidPhone(phone: string): boolean {
  return /^\+?\d{8,15}$/.test(phone) || /^1\d{10}$/.test(phone);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { phone?: unknown; password?: unknown };

    const phoneRaw = typeof body.phone === 'string' ? body.phone : '';
    const phone = normalizePhone(phoneRaw);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!phone || !isValidPhone(phone)) {
      return NextResponse.json({ error: 'Invalid phone or password' }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: 'Invalid phone or password' }, { status: 400 });
    }

    const found = await db
      .select({ id: users.id, phone: users.phone, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);

    if (found.length === 0) {
      return NextResponse.json({ error: 'Invalid phone or password' }, { status: 401 });
    }

    const user = found[0];
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: 'Invalid phone or password' }, { status: 401 });
    }

    const token = signAuthToken({ sub: String(user.id), phone: user.phone });

    const res = NextResponse.json(
      { user: { id: user.id, phone: user.phone } },
      { status: 200 },
    );
    setAuthTokenCookie(res, token);
    res.headers.set('Cache-Control', 'no-store, max-age=0');
    return res;
  } catch {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}

