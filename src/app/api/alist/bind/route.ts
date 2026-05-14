import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { footprintGroupItems, footprintGroups } from '@/db/schema';
import { authenticate } from '../_auth';

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.authorized) return auth.response;
  const userId = auth.userId;

  try {
    const { list_item_id, folder_path } = (await req.json()) as { list_item_id?: number; folder_path?: string };
    if (!list_item_id || !folder_path) return NextResponse.json({ error: '缺少参数' }, { status: 400 });

    const [groupItem] = await db
      .select()
      .from(footprintGroupItems)
      .innerJoin(footprintGroups, eq(footprintGroupItems.groupId, footprintGroups.id))
      .where(and(eq(footprintGroupItems.listItemId, list_item_id), eq(footprintGroups.userId, userId!)))
      .limit(1);
    if (!groupItem) return NextResponse.json({ error: '记录不存在' }, { status: 404 });

    await db.update(footprintGroupItems)
      .set({ cloudFolder: folder_path })
      .where(eq(footprintGroupItems.listItemId, list_item_id));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/alist/bind error:', err);
    return NextResponse.json({ error: '绑定失败' }, { status: 500 });
  }
}
