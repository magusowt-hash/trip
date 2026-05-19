import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { railMapSettings } from '@/db/schema';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';

function verifyAdminToken(req: NextRequest): NextResponse | null {
  const token = getAdminTokenFromRequest(req);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const [, timestamp] = decoded.split(':');
    if (!timestamp) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    const age = Date.now() - parseInt(timestamp);
    if (age > 7 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
  return null;
}

export async function getRailMapAdminSettings(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;

  try {
    const rows = await db.select().from(railMapSettings).limit(1);

    if (rows.length === 0) {
      await db.insert(railMapSettings).values({});
      const inserted = await db.select().from(railMapSettings).limit(1);
      return NextResponse.json({ settings: inserted[0] });
    }

    return NextResponse.json({ settings: rows[0] });
  } catch (error: any) {
    console.error('Rail settings GET error:', error);
    return NextResponse.json({ error: '获取设置失败' }, { status: 500 });
  }
}

export async function putRailMapAdminSettings(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const existing = await db.select().from(railMapSettings).limit(1);

    if (existing.length === 0) {
      await db.insert(railMapSettings).values(body);
    } else {
      await db.update(railMapSettings)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(railMapSettings.id, 1));
    }

    const rows = await db.select().from(railMapSettings).limit(1);
    return NextResponse.json({ settings: rows[0] });
  } catch (error: any) {
    console.error('Rail settings PUT error:', error);
    return NextResponse.json({ error: '更新设置失败: ' + error?.message }, { status: 500 });
  }
}

