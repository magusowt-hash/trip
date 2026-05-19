import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { mapPois } from '@/db/schema';
import { verifyAuthToken, type AuthJwtPayload } from '@/server/auth/jwt';
import { getAuthTokenFromRequest } from '@/server/auth/cookies';

export type PoiPayload = {
  amapPoiId?: string | null;
  name?: string;
  lng?: string;
  lat?: string;
  address?: string;
  city?: string;
  district?: string;
  type?: string;
};

type AuthResult =
  | { authorized: false; response: NextResponse }
  | { authorized: true; userId: number };

export async function authenticateStandardMapRequest(req: NextRequest): Promise<AuthResult> {
  const token = getAuthTokenFromRequest(req);
  if (!token) {
    return {
      authorized: false,
      response: NextResponse.json({ error: '未登录，请先登录' }, { status: 401 }),
    };
  }

  let payload: AuthJwtPayload;
  try {
    payload = await verifyAuthToken(token);
  } catch {
    return {
      authorized: false,
      response: NextResponse.json({ error: '未登录，请先登录' }, { status: 401 }),
    };
  }

  const userId = Number(payload.sub);
  if (!Number.isFinite(userId)) {
    return {
      authorized: false,
      response: NextResponse.json({ error: '无效的用户ID' }, { status: 401 }),
    };
  }

  return { authorized: true, userId };
}

export async function ensureStandardMapPoi(payload: PoiPayload) {
  const amapPoiId = payload.amapPoiId?.trim() || null;
  const name = payload.name?.trim();
  const lng = payload.lng?.trim();
  const lat = payload.lat?.trim();

  if (!name || !lng || !lat) {
    throw new Error('地点信息不完整');
  }

  const existing = amapPoiId
    ? await db.select().from(mapPois).where(eq(mapPois.amapPoiId, amapPoiId)).limit(1)
    : await db.select().from(mapPois).where(and(eq(mapPois.name, name), eq(mapPois.lng, lng), eq(mapPois.lat, lat))).limit(1);

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

