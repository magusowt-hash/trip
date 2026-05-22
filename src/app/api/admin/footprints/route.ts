import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq, sql, desc, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { footprintGroups, footprintGroupItems, users, listItems, storageFiles, userFootprintSettings, mapPois, userMapFootprints } from '@/db/schema';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';
import { parseFootprintPhotoScopeKey, parseMapFootprintPhotoScopeKey } from '@/lib/footprintPhotoScope';

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

      const footprintItemIds = Array.from(new Set(
        files
          .map((file) => parseFootprintPhotoScopeKey(file.placeTitle))
          .filter((value): value is number => Number.isFinite(value)),
      ));
      const mapFootprintIds = Array.from(new Set(
        files
          .map((file) => parseMapFootprintPhotoScopeKey(file.placeTitle))
          .filter((value): value is number => Number.isFinite(value)),
      ));

      const titleMap = new Map<number, string>();
      if (footprintItemIds.length > 0) {
        const scopedItems = await db
          .select({
            id: footprintGroupItems.id,
            title: listItems.title,
          })
          .from(footprintGroupItems)
          .leftJoin(listItems, eq(footprintGroupItems.listItemId, listItems.id))
          .where(inArray(footprintGroupItems.id, footprintItemIds));

        for (const item of scopedItems) {
          titleMap.set(item.id, item.title || `足迹项 #${item.id}`);
        }
      }
      if (mapFootprintIds.length > 0) {
        const mapScopedItems = await db
          .select({
            id: userMapFootprints.id,
            title: mapPois.name,
          })
          .from(userMapFootprints)
          .leftJoin(mapPois, eq(userMapFootprints.poiId, mapPois.id))
          .where(inArray(userMapFootprints.id, mapFootprintIds));
        for (const item of mapScopedItems) {
          titleMap.set(item.id, item.title || `已去地点 #${item.id}`);
        }
      }

      return NextResponse.json({
        files: files.map((file) => {
          const footprintItemId = parseFootprintPhotoScopeKey(file.placeTitle);
          const mapFootprintId = parseMapFootprintPhotoScopeKey(file.placeTitle);
          return {
            ...file,
            footprintItemId,
            mapFootprintId,
            displayTitle: footprintItemId
              ? (titleMap.get(footprintItemId) || file.placeTitle)
              : mapFootprintId
                ? (titleMap.get(mapFootprintId) || file.placeTitle)
                : file.placeTitle,
            scopeKey: file.placeTitle,
          };
        }),
      });
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

    if (groupId) {
      const group = await db
        .select({
          id: footprintGroups.id,
          userId: footprintGroups.userId,
          isDefault: footprintGroups.isDefault,
        })
        .from(footprintGroups)
        .where(eq(footprintGroups.id, parseInt(groupId)))
        .limit(1);
      if (!group[0]) {
        return NextResponse.json({ error: '分类组不存在' }, { status: 404 });
      }

      const listBasedItems = await db
        .select({
          id: footprintGroupItems.id,
          groupId: footprintGroupItems.groupId,
          listItemId: footprintGroupItems.listItemId,
          poiId: sql<null>`NULL`,
          sourceType: sql<string>`'list'`,
          title: listItems.title,
          coverImage: listItems.coverImage,
          address: listItems.address,
          addedAt: footprintGroupItems.addedAt,
        })
        .from(footprintGroupItems)
        .leftJoin(listItems, eq(footprintGroupItems.listItemId, listItems.id))
        .where(eq(footprintGroupItems.groupId, parseInt(groupId)))
        .orderBy(desc(footprintGroupItems.id));

      if (group[0].isDefault !== 1) {
        return NextResponse.json({ items: listBasedItems });
      }

      const mapBasedItems = await db
        .select({
          id: userMapFootprints.id,
          groupId: userMapFootprints.groupId,
          listItemId: sql<null>`NULL`,
          poiId: userMapFootprints.poiId,
          sourceType: sql<string>`'map'`,
          title: mapPois.name,
          coverImage: sql<null>`NULL`,
          address: mapPois.address,
          addedAt: userMapFootprints.createdAt,
        })
        .from(userMapFootprints)
        .leftJoin(mapPois, eq(userMapFootprints.poiId, mapPois.id))
        .where(eq(userMapFootprints.groupId, parseInt(groupId)))
        .orderBy(desc(userMapFootprints.id));

      const items = [...listBasedItems, ...mapBasedItems]
        .sort((a, b) => new Date(String(b.addedAt)).getTime() - new Date(String(a.addedAt)).getTime());

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

    const mapCounts = await db
      .select({
        groupId: userMapFootprints.groupId,
        itemCount: sql<number>`count(*)`,
      })
      .from(userMapFootprints)
      .where(userId ? eq(userMapFootprints.userId, parseInt(userId)) : undefined)
      .groupBy(userMapFootprints.groupId);
    const mapCountByGroupId = new Map(
      mapCounts
        .filter((row) => Number.isFinite(row.groupId as number))
        .map((row) => [Number(row.groupId), Number(row.itemCount || 0)]),
    );

    return NextResponse.json({
      groups: groups.map((group) => ({
        ...group,
        itemCount: Number(group.itemCount || 0) + (mapCountByGroupId.get(group.id) || 0),
      })),
    });
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

  try {
    return NextResponse.json({ error: '不支持的操作' }, { status: 400 });
  } catch (err) {
    console.error('Admin POST /api/admin/footprints error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : '操作失败' }, { status: 500 });
  }
}
