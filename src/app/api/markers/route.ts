import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { markers as markersTable } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    let whereCondition = eq(markersTable.status, 1);
    if (status !== null && status !== undefined && status !== 'all') {
      whereCondition = eq(markersTable.status, status === '1' ? 1 : 0);
    }

    const list = await db
      .select({
        id: markersTable.id,
        name: markersTable.name,
        lng: markersTable.lng,
        lat: markersTable.lat,
        address: markersTable.address,
        description: markersTable.description,
        type: markersTable.type,
      })
      .from(markersTable)
      .where(whereCondition)
      .orderBy(desc(markersTable.id));

    return NextResponse.json({ markers: list });
  } catch (error: any) {
    console.error('Markers GET error:', error);
    return NextResponse.json({ error: '获取标记点列表失败: ' + error?.message }, { status: 500 });
  }
}