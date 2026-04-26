import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { lists, listItems, listImages } from '@/db/schema';
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

    const formattedLists = listsData.map(l => ({
      id: l.id,
      name: l.name,
      cover_image: l.coverImage,
      lng: l.lng,
      lat: l.lat,
      position: l.position,
      intro: l.intro,
    }));

    let items: any[] = [];
    if (listId) {
      items = await db
        .select()
        .from(listItems)
        .where(eq(listItems.listId, parseInt(listId)))
        .orderBy(listItems.orderNum, desc(listItems.id));
    } else if (listsData.length > 0) {
      items = await db
        .select()
        .from(listItems)
        .orderBy(listItems.orderNum, desc(listItems.id));
    }
    
    items = items.map(item => ({
      id: item.id,
      list_id: item.listId,
      title: item.title,
      cover_image: item.coverImage,
      description: item.description,
      intro: item.intro,
      image_url: item.imageUrl,
      lng: item.lng,
      lat: item.lat,
      address: item.address,
      order_num: item.orderNum,
    }));

    return NextResponse.json({ lists: formattedLists, items });
  } catch (error: any) {
    console.error('Lists GET error:', error);
    return NextResponse.json({ error: '获取榜单失败: ' + error?.message }, { status: 500 });
  }
}