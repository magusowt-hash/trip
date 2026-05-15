import { NextResponse } from 'next/server';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';

const crypto = await import('crypto');

function verifyAdminOrToken(req: Request): { authorized: boolean; userId?: number; error?: Response } {
  const url = new URL(req.url);

  // Check view token
  const token = url.searchParams.get('token');
  if (token) {
    try {
      const decoded = Buffer.from(token, 'base64url').toString();
      const [userIdStr, ts] = decoded.split(':');
      const age = Date.now() - parseInt(ts);
      if (age > 30 * 60 * 1000) return { authorized: false, error: NextResponse.json({ error: 'Token已过期' }, { status: 401 }) };
      const userId = parseInt(userIdStr);
      if (!Number.isFinite(userId)) return { authorized: false, error: NextResponse.json({ error: '无效Token' }, { status: 401 }) };
      return { authorized: true, userId };
    } catch {
      return { authorized: false, error: NextResponse.json({ error: '无效Token' }, { status: 401 }) };
    }
  }

  // Check admin auth
  const adminToken = getAdminTokenFromRequest(req);
  if (!adminToken) return { authorized: false, error: NextResponse.json({ error: '未授权' }, { status: 401 }) };

  try {
    const decoded = Buffer.from(adminToken, 'base64').toString();
    const [, ts] = decoded.split(':');
    if (Date.now() - parseInt(ts) > 7 * 24 * 60 * 60 * 1000) {
      return { authorized: false, error: NextResponse.json({ error: 'Token已过期' }, { status: 401 }) };
    }
  } catch {
    return { authorized: false, error: NextResponse.json({ error: '无效Token' }, { status: 401 }) };
  }

  const userId = parseInt(url.searchParams.get('user_id') || '0');
  if (!Number.isFinite(userId)) return { authorized: false, error: NextResponse.json({ error: '缺少user_id' }, { status: 400 }) };

  return { authorized: true, userId };
}

// POST — create a view token for a specific user
export async function POST(req: Request) {
  // Accept admin token from cookie or Authorization header
  let adminToken = getAdminTokenFromRequest(req);
  if (!adminToken) {
    const authHeader = req.headers.get('Authorization') || '';
    adminToken = authHeader.replace('Bearer ', '');
  }
  if (!adminToken) return NextResponse.json({ error: '未授权' }, { status: 401 });

  try {
    const decoded = Buffer.from(adminToken, 'base64').toString();
    const [, ts] = decoded.split(':');
    if (Date.now() - parseInt(ts) > 7 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: 'Token已过期' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: '无效Token' }, { status: 401 });
  }

  const body = await req.json();
  const userId = body.user_id;
  if (!userId) return NextResponse.json({ error: '缺少user_id' }, { status: 400 });

  // Create a short-lived view token (30 minutes)
  const payload = `${userId}:${Date.now()}`;
  const token = Buffer.from(payload).toString('base64url');

  return NextResponse.json({ token, url: `/user/footprints?view=${token}` });
}

// GET — load footprints data for a target user (via view token or admin auth)
export async function GET(req: Request) {
  const auth = verifyAdminOrToken(req);
  if (!auth.authorized) return auth.error!;

  const url = new URL(req.url);
  const type = url.searchParams.get('type');

  try {
    if (type === 'groups') {
      const { footprintGroups, footprintGroupItems } = await import('@/db/schema');
      const groups = await db
        .select({
          id: footprintGroups.id,
          name: footprintGroups.name,
          isDefault: footprintGroups.isDefault,
          itemCount: sql<number>`count(${footprintGroupItems.id})`,
        })
        .from(footprintGroups)
        .leftJoin(footprintGroupItems, sql`${footprintGroups.id} = ${footprintGroupItems.groupId}`)
        .where(sql`${footprintGroups.userId} = ${auth.userId}`)
        .groupBy(footprintGroups.id);

      return NextResponse.json({ groups });
    }

    if (type === 'items') {
      const groupId = parseInt(url.searchParams.get('group_id') || '0');
      if (!groupId) return NextResponse.json({ error: '缺少group_id' }, { status: 400 });

      const { footprintGroupItems, listItems } = await import('@/db/schema');
      const items = await db
        .select({
          id: footprintGroupItems.id,
          listItemId: footprintGroupItems.listItemId,
          title: listItems.title,
          coverImage: listItems.coverImage,
          address: listItems.address,
          lng: listItems.lng,
          lat: listItems.lat,
          addedAt: footprintGroupItems.addedAt,
        })
        .from(footprintGroupItems)
        .leftJoin(listItems, sql`${footprintGroupItems.listItemId} = ${listItems.id}`)
        .where(sql`${footprintGroupItems.groupId} = ${groupId}`);

      return NextResponse.json({ items });
    }

    if (type === 'photos') {
      const { storageFiles } = await import('@/db/schema');
      const files = await db
        .select()
        .from(storageFiles)
        .where(sql`${storageFiles.userId} = ${auth.userId}`);

      return NextResponse.json({ files });
    }

    if (type === 'settings') {
      const { userFootprintSettings } = await import('@/db/schema');
      const [row] = await db
        .select()
        .from(userFootprintSettings)
        .where(sql`${userFootprintSettings.userId} = ${auth.userId}`);

      if (!row) return NextResponse.json({
        showPhotos: true, showLines: true, showLabels: true, showPoiLabels: true, showTitle: true, panelCollapsed: false,
        backgroundColor: '#0f172a', lineColor: '#a5b4fc', lineWidth: 2, lineDashed: true, poiLabelColor: '#000000', markerColor: '#ef4444', markerShape: 'pin',
      });

      return NextResponse.json({
        showPhotos: !!row.showPhotos, showLines: !!row.showLines,
        showLabels: !!row.showLabels, showPoiLabels: !!row.showPoiLabels, showTitle: !!row.showTitle,
        panelCollapsed: !!row.panelCollapsed,
        backgroundColor: row.backgroundColor, lineColor: row.lineColor,
        lineWidth: row.lineWidth, lineDashed: !!row.lineDashed, poiLabelColor: row.poiLabelColor, markerColor: row.markerColor, markerShape: row.markerShape,
      });
    }

    return NextResponse.json({ error: '缺少type参数' }, { status: 400 });
  } catch (err) {
    console.error('View API error:', err);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
