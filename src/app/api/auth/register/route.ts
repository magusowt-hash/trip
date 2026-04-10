import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { hashPassword } from '@/server/auth/password';
import { signAuthToken } from '@/server/auth/jwt';
import { setAuthTokenCookie } from '@/server/auth/cookies';

function normalizePhone(input: string): string {
  const trimmed = input.trim();
  // keep leading +, strip spaces/dashes
  const compact = trimmed.replace(/[\s-]/g, '');
  return compact;
}

function isValidPhone(phone: string): boolean {
  // Accept E.164-ish (+ and digits) or mainland 11-digit numbers.
  // Keep it simple to avoid false negatives; backend can tighten later.
  return /^\+?\d{8,15}$/.test(phone) || /^1\d{10}$/.test(phone);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      phone?: unknown;
      password?: unknown;
      confirmPassword?: unknown;
    };

    const phoneRaw = typeof body.phone === 'string' ? body.phone : '';
    const phone = normalizePhone(phoneRaw);
    const password = typeof body.password === 'string' ? body.password : '';
    const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';

    if (!phone || !isValidPhone(phone)) {
      return NextResponse.json({ error: 'Invalid phone' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 },
      );
    }
    if (password !== confirmPassword) {
      return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
    }

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ error: 'Phone already registered' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const result = await db
      .insert(users)
      .values({
        phone,
        passwordHash,
      });

    const inserted = await db
      .select({ id: users.id, phone: users.phone })
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);

    const user = inserted[0];
    if (!user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    const token = await signAuthToken({ sub: String(user.id), phone: user.phone });

    const res = NextResponse.json(
      { user: { id: user.id, phone: user.phone }, token },
      { status: 201 },
    );
    setAuthTokenCookie(res, token);
    res.headers.set('Cache-Control', 'no-store, max-age=0');
    return res;
  } catch (error) {
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}

