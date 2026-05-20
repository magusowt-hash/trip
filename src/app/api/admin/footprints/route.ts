import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq, sql, desc, and } from 'drizzle-orm';
import { db } from '@/db';
import { footprintGroups, footprintGroupItems, users, listItems, storageFiles, userFootprintSettings } from '@/db/schema';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';
import { bindUnmatchedFolderToItem, listAdminCloudHints, rollbackBoundFolderFromItem, syncCloudMount } from '@/services/footprint-cloud';

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

export async function GET(req: NextRequest) {
  const authError = verifyAdminToken(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get('group_id');
  const userId = searchParams.get('user_id');
  const type = searchParams.get('type');

  try {
    if (type === 'storage') {
      const stats = await db
        .select({
          userId: storageFiles.userId,
          userPhone: sql<string>`max(${users.phone})`,
          userNickname: sql<string>`max(${users.nickname})`,
          fileCount: sql<number>`count(${storageFiles.id})`,
          totalSize: sql<number>`coalesce(sum(${storageFiles.size}), 0)`,
          placeCount: sql<number>`count(distinct ${storageFiles.placeTitle})`,
        })
        .from(storageFiles)
        .leftJoin(users, eq(storageFiles.userId, users.id))
        .groupBy(storageFiles.userId)
        .orderBy(desc(sql`totalSize`));

      return NextResponse.json({ storage: stats });
    }

    if (type === 'storage_detail' && userId) {
      const files = await db
        .select()
        .from(storageFiles)
        .where(eq(storageFiles.userId, parseInt(userId)))
        .orderBy(desc(storageFiles.createdAt));

      return NextResponse.json({ files });
    }

    if (type === 'settings' && userId) {
      const [row] = await db
        .select()
        .from(userFootprintSettings)
        .where(eq(userFootprintSettings.userId, parseInt(userId)));

      if (!row) {
        return NextResponse.json({
          showPhotos: true, showLines: true, showLabels: true, showTitle: true, panelCollapsed: false,
          backgroundColor: '#0f172a', lineColor: '#a5b4fc', lineWidth: 2, lineDashed: true,
        });
      }

      return NextResponse.json({
        showPhotos: !!row.showPhotos,
        showLines: !!row.showLines,
        showLabels: !!row.showLabels,
        showTitle: !!row.showTitle,
        panelCollapsed: !!row.panelCollapsed,
        backgroundColor: row.backgroundColor,
        lineColor: row.lineColor,
        lineWidth: row.lineWidth,
        lineDashed: !!row.lineDashed,
      });
    }

    if (type === 'cloud_hints' && userId) {
      const hints = await listAdminCloudHints(parseInt(userId));
      return NextResponse.json({ hints });
    }

    if (groupId) {
      const items = await db
        .select({
          id: footprintGroupItems.id,
          groupId: footprintGroupItems.groupId,
          listItemId: footprintGroupItems.listItemId,
          title: listItems.title,
          coverImage: listItems.coverImage,
          address: listItems.address,
          addedAt: footprintGroupItems.addedAt,
        })
        .from(footprintGroupItems)
        .leftJoin(listItems, eq(footprintGroupItems.listItemId, listItems.id))
        .where(eq(footprintGroupItems.groupId, parseInt(groupId)))
        .orderBy(desc(footprintGroupItems.id));

      return NextResponse.json({ items });
    }

    const groups = await db
      .select({
        id: footprintGroups.id,
        userId: footprintGroups.userId,
        userPhone: users.phone,
        userNickname: users.nickname,
        name: footprintGroups.name,
        isDefault: footprintGroups.isDefault,
        itemCount: sql<number>`count(${footprintGroupItems.id})`,
        createdAt: footprintGroups.createdAt,
      })
      .from(footprintGroups)
      .leftJoin(users, eq(footprintGroups.userId, users.id))
      .leftJoin(footprintGroupItems, eq(footprintGroups.id, footprintGroupItems.groupId))
      .where(userId ? eq(footprintGroups.userId, parseInt(userId)) : undefined)
      .groupBy(footprintGroups.id)
      .orderBy(desc(footprintGroups.id));

    return NextResponse.json({ groups });
  } catch (err) {
    console.error('Admin GET /api/admin/footprints error:', err);
    return NextResponse.json({ error: '获取足迹数据失败' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authError = verifyAdminToken(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get('group_id');
  const itemId = searchParams.get('item_id');
  const fileId = searchParams.get('file_id');
  const type = searchParams.get('type');

  try {
    if (type === 'storage_delete' && fileId) {
      const [f] = await db.select().from(storageFiles).where(eq(storageFiles.id, parseInt(fileId)));
      if (f) {
        const fs = await import('fs');
        const p = await import('path');
        const filePath = p.default.join(process.cwd(), 'uploads', `user_${f.userId}`, f.placeTitle, f.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        await db.delete(storageFiles).where(eq(storageFiles.id, parseInt(fileId)));
      }
      return NextResponse.json({ success: true });
    }

    if (itemId) {
      await db
        .delete(footprintGroupItems)
        .where(eq(footprintGroupItems.id, parseInt(itemId)));
      return NextResponse.json({ success: true });
    }

    if (!groupId) {
      return NextResponse.json({ error: '缺少group_id参数' }, { status: 400 });
    }

    await db.delete(footprintGroups).where(eq(footprintGroups.id, parseInt(groupId)));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Admin DELETE /api/admin/footprints error:', err);
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authError = verifyAdminToken(req);
  if (authError) return authError;

  const { type, user_id, item_id, folder_id } = await req.json() as {
    type?: string;
    user_id?: number;
    item_id?: number;
    folder_id?: string;
  };

  try {
    if (type === 'cloud_sync') {
      if (!Number.isFinite(user_id) || !Number.isFinite(item_id)) {
        return NextResponse.json({ error: '参数不完整' }, { status: 400 });
      }
      const result = await syncCloudMount(item_id, user_id);
      return NextResponse.json(result);
    }

    if (type === 'cloud_bind_hint') {
      if (!Number.isFinite(user_id) || !Number.isFinite(item_id) || !folder_id?.trim()) {
        return NextResponse.json({ error: '参数不完整' }, { status: 400 });
      }
      const result = await bindUnmatchedFolderToItem(item_id, user_id, folder_id.trim());
      return NextResponse.json(result);
    }

    if (type === 'cloud_rollback_hint') {
      if (!Number.isFinite(user_id) || !Number.isFinite(item_id)) {
        return NextResponse.json({ error: '参数不完整' }, { status: 400 });
      }
      const result = await rollbackBoundFolderFromItem(item_id, user_id);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: '不支持的操作' }, { status: 400 });
  } catch (err) {
    console.error('Admin POST /api/admin/footprints error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : '操作失败' }, { status: 500 });
  }
}
