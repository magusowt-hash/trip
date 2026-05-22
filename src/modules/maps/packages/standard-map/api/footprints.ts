import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import { footprintGroups, mapPois, userMapFootprints } from '@/db/schema';
import { authenticateStandardMapRequest, ensureStandardMapPoi, type PoiPayload } from './shared';

async function ensureDefaultGroup(userId: number): Promise<number> {
  const existing = await db
    .select({ id: footprintGroups.id })
    .from(footprintGroups)
    .where(and(eq(footprintGroups.userId, userId), eq(footprintGroups.isDefault, 1)))
    .limit(1);

  if (existing[0]) return existing[0].id;

  const result = await db.insert(footprintGroups).values({
    userId,
    name: '我的足迹',
    isDefault: 1,
    sortOrder: 0,
  });
  return result[0].insertId;
}

export async function getStandardMapFootprints(req: NextRequest) {
  const auth = await authenticateStandardMapRequest(req);
  if (!auth.authorized) return auth.response;

  try {
    const footprints = await db
      .select({
        recordId: userMapFootprints.id,
        groupId: userMapFootprints.groupId,
        poiId: mapPois.id,
        amapPoiId: mapPois.amapPoiId,
        name: mapPois.name,
        lng: mapPois.lng,
        lat: mapPois.lat,
        address: mapPois.address,
        city: mapPois.city,
        district: mapPois.district,
        type: mapPois.type,
        createdAt: userMapFootprints.createdAt,
      })
      .from(userMapFootprints)
      .innerJoin(mapPois, eq(userMapFootprints.poiId, mapPois.id))
      .where(eq(userMapFootprints.userId, auth.userId))
      .orderBy(desc(userMapFootprints.createdAt));

    return NextResponse.json({ footprints });
  } catch (error) {
    console.error('GET /api/maps/footprints error:', error);
    return NextResponse.json({ error: '获取足迹失败' }, { status: 500 });
  }
}

export async function postStandardMapFootprint(req: NextRequest) {
  const auth = await authenticateStandardMapRequest(req);
  if (!auth.authorized) return auth.response;

  try {
    const body = (await req.json()) as { poi?: PoiPayload };
    const poi = await ensureStandardMapPoi(body.poi || {});
    const groupId = await ensureDefaultGroup(auth.userId);

    const existing = await db
      .select({ id: userMapFootprints.id })
      .from(userMapFootprints)
      .where(
        and(
          eq(userMapFootprints.userId, auth.userId),
          eq(userMapFootprints.poiId, poi.id),
          or(eq(userMapFootprints.groupId, groupId), isNull(userMapFootprints.groupId)),
        ),
      )
      .limit(1);

    if (!existing[0]) {
      await db.insert(userMapFootprints).values({
        userId: auth.userId,
        groupId,
        poiId: poi.id,
      });
    }

    return NextResponse.json({ success: true, groupId, poi });
  } catch (error: any) {
    console.error('POST /api/maps/footprints error:', error);
    return NextResponse.json({ error: error?.message || '设置已去失败' }, { status: 400 });
  }
}

export async function deleteStandardMapFootprint(req: NextRequest) {
  const auth = await authenticateStandardMapRequest(req);
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const poiId = Number(searchParams.get('poiId'));

  if (!Number.isFinite(poiId)) {
    return NextResponse.json({ error: '缺少 poiId' }, { status: 400 });
  }

  try {
    await db
      .delete(userMapFootprints)
      .where(and(eq(userMapFootprints.userId, auth.userId), eq(userMapFootprints.poiId, poiId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/maps/footprints error:', error);
    return NextResponse.json({ error: '移除足迹失败' }, { status: 500 });
  }
}
