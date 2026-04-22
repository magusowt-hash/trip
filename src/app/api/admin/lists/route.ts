import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { lists } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

const AMAP_KEY = 'fbf5d9a8e346f93257eb7c5ab4d32034';

export async function GET(request: NextRequest) {
  try {
    const list = await db
      .select()
      .from(lists)
      .orderBy(desc(lists.id));

    return NextResponse.json({ list });
  } catch (error: any) {
    console.error('Lists GET error:', error);
    return NextResponse.json({ error: '获取榜单列表失败: ' + error?.message }, { status: 500 });
  }
}
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, status } = body;

    if (!name) {
      return NextResponse.json({ error: '名称不能为空' }, { status: 400 });
    }

    const result = await db.insert(lists).values({
      name,
      description: description || null,
      status: status !== undefined ? status : 1,
    });

    return NextResponse.json({ success: true, id: result[0].insertId });
  } catch (error: any) {
    console.error('Lists POST error:', error);
    return NextResponse.json({ error: '创建榜单失败: ' + error?.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const body = await request.json();

    if (!id) {
      return NextResponse.json({ error: '缺少ID' }, { status: 400 });
    }

    const updateData: any = { ...body, updatedAt: new Date() };
    delete updateData.id;

    await db.update(lists).set(updateData).where(eq(lists.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Lists PUT error:', error);
    return NextResponse.json({ error: '更新榜单失败: ' + error?.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少ID' }, { status: 400 });
    }

    await db.delete(lists).where(eq(lists.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Lists DELETE error:', error);
    return NextResponse.json({ error: '删除榜单失败: ' + error?.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address') || '';
    let body = {};
    try {
      body = await request.json();
    } catch {}

    const addr = address || (body as any).address;

    if (!addr) {
      return NextResponse.json({ error: '地址不能为空' }, { status: 400 });
    }

    const url = `https://restapi.amap.com/v3/place/text?key=${AMAP_KEY}&keywords=${encodeURIComponent(addr)}&types=&city=&offset=1`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === '1' && data.pois && data.pois.length > 0) {
      const poi = data.pois[0];
      return NextResponse.json({
        success: true,
        lng: poi.location.split(',')[0],
        lat: poi.location.split(',')[1],
      });
    }

    return NextResponse.json({ error: '未找到该地址' }, { status: 404 });
  } catch (error: any) {
    console.error('Geocode error:', error);
    return NextResponse.json({ error: '地理编码失败: ' + error?.message }, { status: 500 });
  }
}