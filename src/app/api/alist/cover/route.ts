import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { footprintGroupItems, listItems } from '@/db/schema';
import { getFirstImage } from '@/services/alist';
import { authenticate } from '../_auth';

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.authorized) return auth.response;
  const userId = auth.userId;

  try {
    const { list_item_id } = (await req.json()) as { list_item_id?: number };
    if (!list_item_id) return NextResponse.json({ error: '缺少list_item_id' }, { status: 400 });

    const [item] = await db.select({ title: listItems.title }).from(listItems).where(eq(listItems.id, list_item_id));
    if (!item) return NextResponse.json({ error: '地点不存在' }, { status: 404 });

    const url = await getFirstImage(userId!, item.title);
    if (url) {
      await db.update(footprintGroupItems)
        .set({ cloudCover: url, cloudFolder: item.title })
        .where(eq(footprintGroupItems.listItemId, list_item_id));
    }

    return NextResponse.json({ success: true, cloud_cover: url || null });
  } catch (err) {
    console.error('POST /api/alist/cover error:', err);
    return NextResponse.json({ error: '获取封面失败' }, { status: 500 });
  }
}
