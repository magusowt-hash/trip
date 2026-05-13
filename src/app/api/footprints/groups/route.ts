import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq, asc, sql } from 'drizzle-orm';
import { db } from '@/db';
import { footprintGroups, footprintGroupItems } from '@/db/schema';
import { authenticateFootprintRequest } from '../_auth';

const MAX_GROUPS = 20;

export async function GET(req: NextRequest) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  try {
    const groups = await db
      .select({
        id: footprintGroups.id,
        name: footprintGroups.name,
        isDefault: footprintGroups.isDefault,
        sortOrder: footprintGroups.sortOrder,
        itemCount: sql<number>`count(${footprintGroupItems.id})`,
        createdAt: footprintGroups.createdAt,
      })
      .from(footprintGroups)
      .leftJoin(footprintGroupItems, eq(footprintGroups.id, footprintGroupItems.groupId))
      .where(eq(footprintGroups.userId, auth.userId))
      .groupBy(footprintGroups.id)
      .orderBy(asc(footprintGroups.sortOrder), asc(footprintGroups.id));

    // Auto-create default group if user has none
    if (groups.length === 0) {
      await db.insert(footprintGroups).values({
        userId: auth.userId,
        name: '我的足迹',
        isDefault: 1,
        sortOrder: 0,
      });
      const fresh = await db
        .select({
          id: footprintGroups.id,
          name: footprintGroups.name,
          isDefault: footprintGroups.isDefault,
          sortOrder: footprintGroups.sortOrder,
          itemCount: sql<number>`count(${footprintGroupItems.id})`,
          createdAt: footprintGroups.createdAt,
        })
        .from(footprintGroups)
        .leftJoin(footprintGroupItems, eq(footprintGroups.id, footprintGroupItems.groupId))
        .where(eq(footprintGroups.userId, auth.userId))
        .groupBy(footprintGroups.id)
        .orderBy(asc(footprintGroups.sortOrder), asc(footprintGroups.id));
      return NextResponse.json({ groups: fresh }, { status: 200 });
    }

    return NextResponse.json({ groups }, { status: 200 });
  } catch (err) {
    console.error('GET /api/footprints/groups error:', err);
    return NextResponse.json({ error: '获取分类组失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  try {
    const { name } = (await req.json()) as { name?: string };
    if (!name || !name.trim()) {
      return NextResponse.json({ error: '分类组名不能为空' }, { status: 400 });
    }

    const existing = await db
      .select({ count: sql<number>`count(*)` })
      .from(footprintGroups)
      .where(eq(footprintGroups.userId, auth.userId));
    if ((existing[0]?.count ?? 0) >= MAX_GROUPS) {
      return NextResponse.json({ error: `最多创建${MAX_GROUPS}个分类组` }, { status: 400 });
    }

    const maxOrder = await db
      .select({ max: sql<number>`coalesce(max(${footprintGroups.sortOrder}), 0)` })
      .from(footprintGroups)
      .where(eq(footprintGroups.userId, auth.userId));

    const result = await db.insert(footprintGroups).values({
      userId: auth.userId,
      name: name.trim(),
      isDefault: 0,
      sortOrder: (maxOrder[0]?.max ?? 0) + 1,
    });

    return NextResponse.json({
      group: {
        id: result[0].insertId,
        name: name.trim(),
        isDefault: 0,
        sortOrder: (maxOrder[0]?.max ?? 0) + 1,
        itemCount: 0,
      },
    }, { status: 201 });
  } catch (err) {
    console.error('POST /api/footprints/groups error:', err);
    return NextResponse.json({ error: '创建分类组失败' }, { status: 500 });
  }
}
