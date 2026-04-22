import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { lists, listItems } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const listId = searchParams.get('list_id');

    const listsData = await db
      .select()
      .from(lists)
      .where(eq(lists.status, 1))
      .orderBy(desc(lists.id));

    let items: any[] = [];
    if (listId) {
      items = await db
        .select()
        .from(listItems)
        .where(eq(listItems.listId, parseInt(listId)))
        .orderBy(listItems.orderNum, desc(listItems.id));
    }

    return NextResponse.json({ lists: listsData, items });
  } catch (error: any) {
    console.error('Lists GET error:', error);
    return NextResponse.json({ error: '获取榜单失败: ' + error?.message }, { status: 500 });
  }
}