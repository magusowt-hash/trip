import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { markers as markersTable, markerImages as markerImagesTable } from '@/db/schema';
import { eq, desc, sql, and } from 'drizzle-orm';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';

const AMAP_KEY = 'fbf5d9a8e346f93257eb7c5ab4d32034';

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

export async function GET(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;
  
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const status = searchParams.get('status');
    const search = searchParams.get('search') || '';
    const offset = (page - 1) * pageSize;

    let whereCondition = undefined;
    if (status !== null && status !== undefined && status !== 'all') {
      whereCondition = eq(markersTable.status, status === '1' ? 1 : 0);
    }

    const list = await db
      .select()
      .from(markersTable)
      .where(whereCondition)
      .orderBy(desc(markersTable.id))
      .limit(pageSize)
      .offset(offset);

    const countResult = await db.select({ count: sql<number>`count(*)` }).from(markersTable).where(whereCondition);
    const total = Number(countResult[0]?.count || 0);

    return NextResponse.json({ list, total });
  } catch (error: any) {
    console.error('Markers GET error:', error);
    return NextResponse.json({ error: '获取标记点列表失败: ' + error?.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, lng, lat, address, description, type, status } = body;

    if (!name) {
      return NextResponse.json({ error: '名称不能为空' }, { status: 400 });
    }

    const result = await db.insert(markersTable).values({
      name,
      lng: lng || null,
      lat: lat || null,
      address: address || null,
      description: description || null,
      type: type || 'other',
      status: status !== undefined ? status : 1,
    });

    return NextResponse.json({ success: true, id: result[0].insertId });
  } catch (error: any) {
    console.error('Markers POST error:', error);
    return NextResponse.json({ error: '创建标记点失败: ' + error?.message }, { status: 500 });
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

    const { name, lng, lat, address, description, type, status } = body;

    const updateData: any = { ...body, updatedAt: new Date() };
    delete updateData.id;

    await db.update(markersTable).set(updateData).where(eq(markersTable.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Markers PUT error:', error);
    return NextResponse.json({ error: '更新标记点失败: ' + error?.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少ID' }, { status: 400 });
    }

    await db.delete(markersTable).where(eq(markersTable.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Markers DELETE error:', error);
    return NextResponse.json({ error: '删除标记点失败: ' + error?.message }, { status: 500 });
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
        location: poi.location,
        lng: poi.location.split(',')[0],
        lat: poi.location.split(',')[1],
        name: poi.name,
        address: poi.address,
      });
    }

    return NextResponse.json({ error: '未找到该地址' }, { status: 404 });
  } catch (error: any) {
    console.error('Geocode error:', error);
    return NextResponse.json({ error: '地理编码失败: ' + error?.message }, { status: 500 });
  }
}