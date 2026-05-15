import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { mapPois, userMapFavorites } from '@/db/schema';
import { authenticateMapsRequest } from '../_auth';

type PoiPayload = {
  amapPoiId?: string | null;
  name?: string;
  lng?: string;
  lat?: string;
  address?: string;
  city?: string;
  district?: string;
  type?: string;
};

async function ensurePoi(payload: PoiPayload) {
  const amapPoiId = payload.amapPoiId?.trim() || null;
  const name = payload.name?.trim();
  const lng = payload.lng?.trim();
  const lat = payload.lat?.trim();

  if (!name || !lng || !lat) {
    throw new Error('地点信息不完整');
  }

  const existing = amapPoiId
    ? await db
        .select()
        .from(mapPois)
        .where(eq(mapPois.amapPoiId, amapPoiId))
        .limit(1)
    : await db
        .select()
        .from(mapPois)
        .where(and(eq(mapPois.name, name), eq(mapPois.lng, lng), eq(mapPois.lat, lat)))
        .limit(1);

  if (existing[0]) return existing[0];

  const result = await db.insert(mapPois).values({
    amapPoiId,
    name,
    lng,
    lat,
    address: payload.address?.trim() || null,
    city: payload.city?.trim() || null,
    district: payload.district?.trim() || null,
    type: payload.type?.trim() || null,
    source: 'amap',
  });

  const created = await db.select().from(mapPois).where(eq(mapPois.id, result[0].insertId)).limit(1);
  if (!created[0]) throw new Error('创建地点失败');
  return created[0];
}

export async function GET(req: NextRequest) {
  const auth = await authenticateMapsRequest(req);
  if (!auth.authorized) return auth.response;

  try {
    const favorites = await db
      .select({
        favoriteId: userMapFavorites.id,
        poiId: mapPois.id,
        amapPoiId: mapPois.amapPoiId,
        name: mapPois.name,
        lng: mapPois.lng,
        lat: mapPois.lat,
        address: mapPois.address,
        city: mapPois.city,
        district: mapPois.district,
        type: mapPois.type,
        createdAt: userMapFavorites.createdAt,
      })
      .from(userMapFavorites)
      .innerJoin(mapPois, eq(userMapFavorites.poiId, mapPois.id))
      .where(eq(userMapFavorites.userId, auth.userId))
      .orderBy(desc(userMapFavorites.createdAt));

    return NextResponse.json({ favorites });
  } catch (error) {
    console.error('GET /api/maps/favorites error:', error);
    return NextResponse.json({ error: '获取收藏失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateMapsRequest(req);
  if (!auth.authorized) return auth.response;

  try {
    const body = (await req.json()) as { poi?: PoiPayload };
    const poi = await ensurePoi(body.poi || {});

    const existing = await db
      .select({ id: userMapFavorites.id })
      .from(userMapFavorites)
      .where(and(eq(userMapFavorites.userId, auth.userId), eq(userMapFavorites.poiId, poi.id)))
      .limit(1);

    if (!existing[0]) {
      await db.insert(userMapFavorites).values({ userId: auth.userId, poiId: poi.id });
    }

    return NextResponse.json({ success: true, poi });
  } catch (error: any) {
    console.error('POST /api/maps/favorites error:', error);
    return NextResponse.json({ error: error?.message || '收藏失败' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateMapsRequest(req);
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const poiId = Number(searchParams.get('poiId'));

  if (!Number.isFinite(poiId)) {
    return NextResponse.json({ error: '缺少 poiId' }, { status: 400 });
  }

  try {
    await db
      .delete(userMapFavorites)
      .where(and(eq(userMapFavorites.userId, auth.userId), eq(userMapFavorites.poiId, poiId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/maps/favorites error:', error);
    return NextResponse.json({ error: '取消收藏失败' }, { status: 500 });
  }
}
