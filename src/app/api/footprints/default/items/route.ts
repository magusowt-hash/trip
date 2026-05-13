import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { footprintGroups, footprintGroupItems, users } from '@/db/schema';
import { authenticateFootprintRequest } from '../../_auth';

async function ensureDefaultGroup(userId: number): Promise<number> {
  const [defaultGroup] = await db
    .select()
    .from(footprintGroups)
    .where(
      and(
        eq(footprintGroups.userId, userId),
        eq(footprintGroups.isDefault, 1),
      ),
    );

  if (defaultGroup) return defaultGroup.id;

  const [newGroup] = await db.insert(footprintGroups).values({
    userId,
    name: '我的足迹',
    isDefault: 1,
    sortOrder: 0,
  });
  return newGroup.insertId;
}

export async function POST(req: NextRequest) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  try {
    const { list_item_id } = (await req.json()) as { list_item_id?: number };
    if (!list_item_id || !Number.isFinite(list_item_id)) {
      return NextResponse.json({ error: '无效的地点ID' }, { status: 400 });
    }

    const groupId = await ensureDefaultGroup(auth.userId);

    const [existing] = await db
      .select()
      .from(footprintGroupItems)
      .where(
        and(
          eq(footprintGroupItems.groupId, groupId),
          eq(footprintGroupItems.listItemId, list_item_id),
        ),
      );

    if (!existing) {
      await db.insert(footprintGroupItems).values({
        groupId,
        listItemId: list_item_id,
      });
    }

    const [user] = await db
      .select({ visitedPlaces: users.visitedPlaces })
      .from(users)
      .where(eq(users.id, auth.userId));

    const visited = Array.isArray(user?.visitedPlaces)
      ? user.visitedPlaces
      : [];
    const idx = visited.findIndex(
      (v: any) => v.listItemId === list_item_id,
    );
    if (idx < 0) {
      visited.push({
        listItemId: list_item_id,
        addedAt: new Date().toISOString(),
      });
      await db
        .update(users)
        .set({ visitedPlaces: visited })
        .where(eq(users.id, auth.userId));
    }

    return NextResponse.json({ success: true, group_id: groupId }, { status: 200 });
  } catch (err) {
    console.error('POST /api/footprints/default/items error:', err);
    return NextResponse.json({ error: '添加失败' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const itemIdParam = searchParams.get('list_item_id');

  if (!itemIdParam) {
    return NextResponse.json({ error: '缺少list_item_id参数' }, { status: 400 });
  }

  const listItemId = parseInt(itemIdParam);
  if (!Number.isFinite(listItemId)) {
    return NextResponse.json({ error: '无效的地点ID' }, { status: 400 });
  }

  try {
    const [defaultGroup] = await db
      .select()
      .from(footprintGroups)
      .where(
        and(
          eq(footprintGroups.userId, auth.userId),
          eq(footprintGroups.isDefault, 1),
        ),
      );

    if (defaultGroup) {
      await db
        .delete(footprintGroupItems)
        .where(
          and(
            eq(footprintGroupItems.groupId, defaultGroup.id),
            eq(footprintGroupItems.listItemId, listItemId),
          ),
        );
    }

    const [user] = await db
      .select({ visitedPlaces: users.visitedPlaces })
      .from(users)
      .where(eq(users.id, auth.userId));

    const visited = Array.isArray(user?.visitedPlaces)
      ? user.visitedPlaces
      : [];
    const filtered = visited.filter(
      (v: any) => v.listItemId !== listItemId,
    );
    await db
      .update(users)
      .set({ visitedPlaces: filtered })
      .where(eq(users.id, auth.userId));

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('DELETE /api/footprints/default/items error:', err);
    return NextResponse.json({ error: '移除失败' }, { status: 500 });
  }
}
