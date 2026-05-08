import { NextRequest, NextResponse } from 'next/server';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';
import { db } from '@/db';
import { listItems } from '@/db/schema';
import { eq, desc, sql, and } from 'drizzle-orm';

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

const AMAP_KEY = 'fbf5d9a8e346f93257eb7c5ab4d32034';

export async function GET(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;
  try {
    const { searchParams } = new URL(request.url);
    const listId = searchParams.get('list_id');

    let whereCondition = undefined;
    if (listId) {
      whereCondition = eq(listItems.listId, parseInt(listId));
    }

    const list = await db
      .select()
      .from(listItems)
      .where(whereCondition)
      .orderBy(listItems.orderNum, desc(listItems.id));

    const formatted = list.map(item => ({
      ...item,
      cover_image: item.coverImage,
      transport_plane: item.transportPlane,
      transport_train: item.transportTrain,
      transport_bus: item.transportBus,
      rating_type: item.ratingType,
      custom_rating: item.customRating,
    }));

    return NextResponse.json({ list: formatted });
  } catch (error: any) {
    console.error('ListItems GET error:', error);
    return NextResponse.json({ error: '获取榜单项失败: ' + error?.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;
  try {
    const body = await request.json();
    const { list_id, title, cover_image, description, lng, lat, address, order_num, status } = body;

    if (!title || !list_id) {
      return NextResponse.json({ error: '名称和榜单ID不能为空' }, { status: 400 });
    }

    const result = await db.insert(listItems).values({
      listId: list_id,
      title,
      coverImage: cover_image || null,
      description: description || null,
      lng: lng || null,
      lat: lat || null,
      address: address || null,
      orderNum: order_num || 0,
      status: status !== undefined ? status : 1,
    });

    return NextResponse.json({ success: true, id: result[0].insertId });
  } catch (error: any) {
    console.error('ListItems POST error:', error);
    return NextResponse.json({ error: '创建榜单项失败: ' + error?.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const body = await request.json();

    if (!id) {
      return NextResponse.json({ error: '缺少ID' }, { status: 400 });
    }

    const { cover_image, intro, image_url, transport_plane, transport_train, transport_bus, rating_type, custom_rating, ...rest } = body;
    const updateData: any = { ...rest, updatedAt: new Date() };
    if (cover_image !== undefined) {
      updateData.coverImage = cover_image;
    }
    if (intro !== undefined) {
      updateData.intro = intro;
    }
    if (image_url !== undefined) {
      updateData.imageUrl = image_url;
    }
    if (transport_plane !== undefined) {
      updateData.transportPlane = transport_plane || null;
    }
    if (transport_train !== undefined) {
      updateData.transportTrain = transport_train || null;
    }
    if (transport_bus !== undefined) {
      updateData.transportBus = transport_bus || null;
    }
    if (rating_type !== undefined) {
      updateData.ratingType = rating_type;
    }
    if (custom_rating !== undefined) {
      updateData.customRating = custom_rating || null;
    }
    delete updateData.id;

    await db.update(listItems).set(updateData).where(eq(listItems.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('ListItems PUT error:', error);
    return NextResponse.json({ error: '更新榜单项失败: ' + error?.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少ID' }, { status: 400 });
    }

    await db.delete(listItems).where(eq(listItems.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('ListItems DELETE error:', error);
    return NextResponse.json({ error: '删除榜单项失败: ' + error?.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;
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