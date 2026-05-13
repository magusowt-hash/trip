import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq, sql, desc } from 'drizzle-orm';
import { db } from '@/db';
import { footprintGroups, footprintGroupItems, users, listItems } from '@/db/schema';
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

export async function GET(req: NextRequest) {
  const authError = verifyAdminToken(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get('group_id');
  const userId = searchParams.get('user_id');

  try {
    if (groupId) {
      const items = await db
        .select({
          id: footprintGroupItems.id,
          groupId: footprintGroupItems.groupId,
          listItemId: footprintGroupItems.listItemId,
          title: listItems.title,
          coverImage: listItems.coverImage,
          address: listItems.address,
          addedAt: footprintGroupItems.addedAt,
        })
        .from(footprintGroupItems)
        .leftJoin(listItems, eq(footprintGroupItems.listItemId, listItems.id))
        .where(eq(footprintGroupItems.groupId, parseInt(groupId)))
        .orderBy(desc(footprintGroupItems.id));

      return NextResponse.json({ items });
    }

    const groups = await db
      .select({
        id: footprintGroups.id,
        userId: footprintGroups.userId,
        userPhone: users.phone,
        userNickname: users.nickname,
        name: footprintGroups.name,
        isDefault: footprintGroups.isDefault,
        itemCount: sql<number>`count(${footprintGroupItems.id})`,
        createdAt: footprintGroups.createdAt,
      })
      .from(footprintGroups)
      .leftJoin(users, eq(footprintGroups.userId, users.id))
      .leftJoin(footprintGroupItems, eq(footprintGroups.id, footprintGroupItems.groupId))
      .where(userId ? eq(footprintGroups.userId, parseInt(userId)) : undefined)
      .groupBy(footprintGroups.id)
      .orderBy(desc(footprintGroups.id));

    return NextResponse.json({ groups });
  } catch (err) {
    console.error('Admin GET /api/admin/footprints error:', err);
    return NextResponse.json({ error: '获取足迹数据失败' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authError = verifyAdminToken(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get('group_id');
  const itemId = searchParams.get('item_id');

  try {
    if (itemId) {
      await db
        .delete(footprintGroupItems)
        .where(eq(footprintGroupItems.id, parseInt(itemId)));
      return NextResponse.json({ success: true });
    }

    if (!groupId) {
      return NextResponse.json({ error: '缺少group_id参数' }, { status: 400 });
    }

    await db.delete(footprintGroups).where(eq(footprintGroups.id, parseInt(groupId)));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Admin DELETE /api/admin/footprints error:', err);
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}
