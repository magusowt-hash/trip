import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { stationOverrides } from '@/db/schema';
import { eq, like, or, desc } from 'drizzle-orm';
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

export async function GET(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;

  try {
    const q = (request.nextUrl.searchParams.get('q') || '').trim();
    
    let list;
    if (q) {
      list = await db
        .select()
        .from(stationOverrides)
        .where(
          or(
            like(stationOverrides.stationName, `%${q}%`),
            like(stationOverrides.displayName, `%${q}%`),
          )
        )
        .orderBy(desc(stationOverrides.updatedAt))
        .limit(200);
    } else {
      list = await db
        .select()
        .from(stationOverrides)
        .orderBy(desc(stationOverrides.updatedAt))
        .limit(200);
    }

    return NextResponse.json({ list });
  } catch (error: any) {
    console.error('Station overrides GET error:', error);
    return NextResponse.json({ error: '获取列表失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { stationName, displayName, levelOverride, displayLevel } = body;

    if (!stationName) {
      return NextResponse.json({ error: '站名不能为空' }, { status: 400 });
    }

    // upsert: 如果已存在则更新
    const existing = await db
      .select()
      .from(stationOverrides)
      .where(eq(stationOverrides.stationName, stationName))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(stationOverrides)
        .set({
          displayName: displayName || null,
          levelOverride: levelOverride || null,
          displayLevel: displayLevel || null,
          updatedAt: new Date(),
        })
        .where(eq(stationOverrides.stationName, stationName));
    } else {
      await db.insert(stationOverrides).values({
        stationName,
        displayName: displayName || null,
        levelOverride: levelOverride || null,
        displayLevel: displayLevel || null,
      });
    }

    const rows = await db
      .select()
      .from(stationOverrides)
      .where(eq(stationOverrides.stationName, stationName))
      .limit(1);

    return NextResponse.json({ success: true, item: rows[0] });
  } catch (error: any) {
    console.error('Station override POST error:', error);
    return NextResponse.json({ error: '保存失败: ' + error?.message }, { status: 500 });
  }
}
