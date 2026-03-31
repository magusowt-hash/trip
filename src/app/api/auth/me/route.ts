import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { verifyAuthToken } from '@/server/auth/jwt';
import { getAuthTokenFromRequest } from '@/server/auth/cookies';

export async function GET(req: NextRequest) {
  try {
    const token = getAuthTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = verifyAuthToken(token);
    const userId = Number(payload.sub);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const found = await db
      .select({ id: users.id, phone: users.phone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = found[0];
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { user: { id: user.id, phone: user.phone } },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

