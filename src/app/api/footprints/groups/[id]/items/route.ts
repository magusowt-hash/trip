import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/db';
import { footprintGroups, footprintGroupItems } from '@/db/schema';
import { listItems, lists } from '@/db/schema';
import { authenticateFootprintRequest } from '../../../_auth';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  const groupId = parseInt(params.id);
  if (!Number.isFinite(groupId)) {
    return NextResponse.json({ error: '无效的分类组ID' }, { status: 400 });
  }

  try {
    const [group] = await db
      .select()
      .from(footprintGroups)
      .where(eq(footprintGroups.id, groupId));
    if (!group || group.userId !== auth.userId) {
      return NextResponse.json({ error: '分类组不存在' }, { status: 404 });
    }

    const items = await db
      .select({
        id: footprintGroupItems.id,
        listItemId: footprintGroupItems.listItemId,
        addedAt: footprintGroupItems.addedAt,
        title: listItems.title,
        coverImage: listItems.coverImage,
        description: listItems.description,
        lng: listItems.lng,
        lat: listItems.lat,
        address: listItems.address,
        listId: listItems.listId,
        listName: lists.name,
      })
      .from(footprintGroupItems)
      .innerJoin(listItems, eq(footprintGroupItems.listItemId, listItems.id))
      .leftJoin(lists, eq(listItems.listId, lists.id))
      .where(eq(footprintGroupItems.groupId, groupId))
      .orderBy(desc(footprintGroupItems.id));

    return NextResponse.json({ items }, { status: 200 });
  } catch (err) {
    console.error('GET /api/footprints/groups/[id]/items error:', err);
    return NextResponse.json({ error: '获取分类组地点失败' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  const groupId = parseInt(params.id);
  if (!Number.isFinite(groupId)) {
    return NextResponse.json({ error: '无效的分类组ID' }, { status: 400 });
  }

  try {
    const [group] = await db
      .select()
      .from(footprintGroups)
      .where(eq(footprintGroups.id, groupId));
    if (!group || group.userId !== auth.userId) {
      return NextResponse.json({ error: '分类组不存在' }, { status: 404 });
    }

    const { list_item_id } = (await req.json()) as { list_item_id?: number };
    if (!list_item_id || !Number.isFinite(list_item_id)) {
      return NextResponse.json({ error: '无效的地点ID' }, { status: 400 });
    }

    const [existing] = await db
      .select()
      .from(footprintGroupItems)
      .where(
        and(
          eq(footprintGroupItems.groupId, groupId),
          eq(footprintGroupItems.listItemId, list_item_id),
        ),
      );

    if (existing) {
      return NextResponse.json({ error: '该地点已在此分类组中' }, { status: 409 });
    }

    const result = await db.insert(footprintGroupItems).values({
      groupId,
      listItemId: list_item_id,
    });

    return NextResponse.json({ id: result[0].insertId }, { status: 201 });
  } catch (err) {
    console.error('POST /api/footprints/groups/[id]/items error:', err);
    return NextResponse.json({ error: '添加地点失败' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  const groupId = parseInt(params.id);
  if (!Number.isFinite(groupId)) {
    return NextResponse.json({ error: '无效的分类组ID' }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const itemIdParam = searchParams.get('item_id');

  if (itemIdParam) {
    const itemId = parseInt(itemIdParam);
    if (!Number.isFinite(itemId)) {
      return NextResponse.json({ error: '无效的地点ID' }, { status: 400 });
    }

    try {
      const [group] = await db
        .select()
        .from(footprintGroups)
        .where(eq(footprintGroups.id, groupId));
      if (!group || group.userId !== auth.userId) {
        return NextResponse.json({ error: '分类组不存在' }, { status: 404 });
      }

      await db
        .delete(footprintGroupItems)
        .where(
          and(
            eq(footprintGroupItems.groupId, groupId),
            eq(footprintGroupItems.listItemId, itemId),
          ),
        );

      return NextResponse.json({ success: true }, { status: 200 });
    } catch (err) {
      console.error('DELETE item from group error:', err);
      return NextResponse.json({ error: '移除地点失败' }, { status: 500 });
    }
  }

  try {
    const [item] = await db
      .select()
      .from(footprintGroupItems)
      .where(eq(footprintGroupItems.id, groupId));
    if (!item) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    const [group] = await db
      .select()
      .from(footprintGroups)
      .where(eq(footprintGroups.id, item.groupId));
    if (!group || group.userId !== auth.userId) {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    await db.delete(footprintGroupItems).where(eq(footprintGroupItems.id, groupId));

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('DELETE /api/footprints/groups/[id]/items error:', err);
    return NextResponse.json({ error: '移除失败' }, { status: 500 });
  }
}
