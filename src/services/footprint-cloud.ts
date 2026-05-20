import { and, desc, eq, sql } from 'drizzle-orm';
import path from 'path';
import { db } from '@/db';
import { cloudAssets, cloudMounts, cloudSyncLogs, footprintGroupItems, footprintGroups, listItems, storageFiles } from '@/db/schema';
import { listFilesByFullPath, listRootFolders, testConnection } from '@/services/alist';
import { saveCloudFileRecord } from '@/services/storage';

type SyncSummary = {
  importedAssetCount: number;
  skippedAssetCount: number;
  matchedFolderCount: number;
  unboundFolderCount: number;
};

function normalizeName(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .toLowerCase();
}

function parseSummary(raw: string | null): SyncSummary | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SyncSummary;
  } catch {
    return null;
  }
}

export async function getFootprintItemForUser(itemId: number, userId: number) {
  const [item] = await db
    .select({
      id: footprintGroupItems.id,
      listItemId: footprintGroupItems.listItemId,
      title: listItems.title,
      cloudFolder: footprintGroupItems.cloudFolder,
    })
    .from(footprintGroupItems)
    .innerJoin(footprintGroups, eq(footprintGroupItems.groupId, footprintGroups.id))
    .innerJoin(listItems, eq(footprintGroupItems.listItemId, listItems.id))
    .where(and(eq(footprintGroupItems.id, itemId), eq(footprintGroups.userId, userId)));

  if (!item) return null;

  return item;
}

export async function getFootprintCloudStatus(itemId: number, userId: number) {
  const item = await getFootprintItemForUser(itemId, userId);
  if (!item) return null;

  const [mount] = await db
    .select()
    .from(cloudMounts)
    .where(and(eq(cloudMounts.userId, userId), eq(cloudMounts.footprintItemId, itemId)))
    .orderBy(desc(cloudMounts.id));

  if (!mount) {
    return {
      itemId: String(item.id),
      itemName: item.title,
      mountState: 'unmounted' as const,
      connectionState: 'unknown' as const,
      syncState: 'idle' as const,
      unboundFolderCount: 0,
      unboundAssetCount: 0,
      lastSyncAt: null,
      lastSyncStatus: null,
      lastSyncSummary: null,
      rootPath: null,
    };
  }

  const [lastLog] = await db
    .select()
    .from(cloudSyncLogs)
    .where(eq(cloudSyncLogs.mountId, mount.id))
    .orderBy(desc(cloudSyncLogs.id));

  const [unboundAgg] = await db
    .select({
      folderCount: sql<number>`count(*)`,
      assetCount: sql<number>`coalesce(sum(${cloudAssets.assetCount}), 0)`,
    })
    .from(cloudAssets)
    .where(eq(cloudAssets.mountId, mount.id));

  return {
    itemId: String(item.id),
    itemName: item.title,
    mountState: 'mounted' as const,
    connectionState: (mount.connectionStatus === 'connected' ? 'connected' : mount.connectionStatus === 'disconnected' ? 'disconnected' : 'unknown') as 'unknown' | 'connected' | 'disconnected',
    syncState: 'idle' as const,
    unboundFolderCount: Number(unboundAgg?.folderCount) || 0,
    unboundAssetCount: Number(unboundAgg?.assetCount) || 0,
    lastSyncAt: lastLog?.createdAt ?? null,
    lastSyncStatus: lastLog ? (lastLog.status === 'success' ? 'success' : 'failed') : null,
    lastSyncSummary: parseSummary(lastLog?.summaryJson ?? null),
    rootPath: mount.rootPath,
  };
}

export async function listCloudHints(itemId: number, userId: number) {
  const [mount] = await db
    .select()
    .from(cloudMounts)
    .where(and(eq(cloudMounts.userId, userId), eq(cloudMounts.footprintItemId, itemId)))
    .orderBy(desc(cloudMounts.id));

  if (!mount) {
    return { itemId: String(itemId), totalFolders: 0, totalAssets: 0, hints: [] };
  }

  const hints = await db
    .select({
      folderId: cloudAssets.folderId,
      folderName: cloudAssets.folderName,
      assetCount: cloudAssets.assetCount,
      sampleThumbnailUrl: cloudAssets.sampleThumbnailUrl,
      status: cloudAssets.status,
      reason: cloudAssets.reason,
    })
    .from(cloudAssets)
    .where(eq(cloudAssets.mountId, mount.id))
    .orderBy(desc(cloudAssets.assetCount), desc(cloudAssets.id));

  return {
    itemId: String(itemId),
    totalFolders: hints.length,
    totalAssets: hints.reduce((sum, hint) => sum + (hint.assetCount || 0), 0),
    hints,
  };
}

export async function listAdminCloudHints(userId: number) {
  const mounts = await db
    .select({
      mountId: cloudMounts.id,
      footprintItemId: cloudMounts.footprintItemId,
      rootPath: cloudMounts.rootPath,
      connectionStatus: cloudMounts.connectionStatus,
      itemName: listItems.title,
    })
    .from(cloudMounts)
    .innerJoin(footprintGroupItems, eq(cloudMounts.footprintItemId, footprintGroupItems.id))
    .innerJoin(listItems, eq(footprintGroupItems.listItemId, listItems.id))
    .where(eq(cloudMounts.userId, userId))
    .orderBy(desc(cloudMounts.id));

  const results = await Promise.all(mounts.map(async mount => {
    const hints = await db
      .select({
        folderId: cloudAssets.folderId,
        folderName: cloudAssets.folderName,
        assetCount: cloudAssets.assetCount,
        sampleThumbnailUrl: cloudAssets.sampleThumbnailUrl,
        status: cloudAssets.status,
        reason: cloudAssets.reason,
      })
      .from(cloudAssets)
      .where(eq(cloudAssets.mountId, mount.mountId))
      .orderBy(desc(cloudAssets.assetCount), desc(cloudAssets.id));

    return {
      mountId: mount.mountId,
      footprintItemId: mount.footprintItemId,
      itemName: mount.itemName,
      rootPath: mount.rootPath,
      connectionState: mount.connectionStatus,
      totalFolders: hints.length,
      totalAssets: hints.reduce((sum, hint) => sum + (hint.assetCount || 0), 0),
      hints,
    };
  }));

  return results.filter(result => result.totalFolders > 0);
}

async function clearMountedData(mountId: number, userId: number, rootPath: string, footprintItemId: number) {
  await db.delete(cloudAssets).where(eq(cloudAssets.mountId, mountId));
  await db.delete(cloudSyncLogs).where(eq(cloudSyncLogs.mountId, mountId));
  await db
    .delete(storageFiles)
    .where(and(eq(storageFiles.userId, userId), eq(storageFiles.sourceType, 'cloud'), eq(storageFiles.sourceFolder, rootPath)));
  await db.update(footprintGroupItems).set({ cloudFolder: null }).where(eq(footprintGroupItems.id, footprintItemId));
}

export async function connectCloudMount(itemId: number, userId: number, rootPath: string) {
  const item = await getFootprintItemForUser(itemId, userId);
  if (!item) throw new Error('足迹项不存在');

  const normalizedRootPath = rootPath.trim();
  if (!normalizedRootPath) throw new Error('缺少挂载网盘目录');

  const [existingMount] = await db
    .select()
    .from(cloudMounts)
    .where(eq(cloudMounts.userId, userId))
    .orderBy(desc(cloudMounts.id));

  if (existingMount && existingMount.footprintItemId === itemId && existingMount.rootPath === normalizedRootPath) {
    const ok = await testConnection().catch(() => false);
    const connectionStatus = ok ? 'connected' : 'disconnected';
    await db
      .update(cloudMounts)
      .set({
        provider: 'alist',
        status: 'mounted',
        connectionStatus,
      })
      .where(eq(cloudMounts.id, existingMount.id));

    await db
      .update(footprintGroupItems)
      .set({ cloudFolder: normalizedRootPath })
      .where(eq(footprintGroupItems.id, itemId));

    return getFootprintCloudStatus(itemId, userId);
  }

  const ok = await testConnection().catch(() => false);
  const connectionStatus = ok ? 'connected' : 'disconnected';

  if (existingMount) {
    await clearMountedData(existingMount.id, userId, existingMount.rootPath, existingMount.footprintItemId);
    await db
      .update(cloudMounts)
      .set({
        footprintItemId: itemId,
        provider: 'alist',
        rootPath: normalizedRootPath,
        status: 'mounted',
        connectionStatus,
      })
      .where(eq(cloudMounts.id, existingMount.id));
  } else {
    await db.insert(cloudMounts).values({
      userId,
      footprintItemId: itemId,
      provider: 'alist',
      rootPath: normalizedRootPath,
      status: 'mounted',
      connectionStatus,
    });
  }

  await db
    .update(footprintGroupItems)
    .set({ cloudFolder: normalizedRootPath })
    .where(eq(footprintGroupItems.id, itemId));

  return getFootprintCloudStatus(itemId, userId);
}

export async function disconnectCloudMount(itemId: number, userId: number) {
  const [mount] = await db
    .select()
    .from(cloudMounts)
    .where(and(eq(cloudMounts.userId, userId), eq(cloudMounts.footprintItemId, itemId)))
    .orderBy(desc(cloudMounts.id));
  if (!mount) return;

  await clearMountedData(mount.id, userId, mount.rootPath, mount.footprintItemId);
  await db.delete(cloudMounts).where(eq(cloudMounts.id, mount.id));
}

export async function listMountCandidates(userId: number, itemId: number) {
  const item = await getFootprintItemForUser(itemId, userId);
  if (!item) return [];

  const folders = await listRootFolders(userId).catch(() => []);
  const normalizedTitle = normalizeName(item.title);
  return folders.map(folder => ({
    rootPath: folder.path,
    displayName: folder.name,
    provider: 'alist' as const,
    connectionState: 'connected' as const,
    matched: normalizeName(folder.name) === normalizedTitle,
  }));
}

export async function syncCloudMount(itemId: number, userId: number) {
  const status = await getFootprintCloudStatus(itemId, userId);
  if (!status) throw new Error('足迹项不存在');
  if (status.mountState !== 'mounted') throw new Error('当前足迹项尚未挂载网盘');

  const [mount] = await db
    .select()
    .from(cloudMounts)
    .where(and(eq(cloudMounts.userId, userId), eq(cloudMounts.footprintItemId, itemId)))
    .orderBy(desc(cloudMounts.id));
  if (!mount) throw new Error('挂载网盘记录不存在');
  if (mount.connectionStatus !== 'connected') {
    throw new Error('当前无法访问网盘，请先恢复连接');
  }

  let importedAssetCount = 0;
  let skippedAssetCount = 0;
  let matchedFolderCount = 0;
  let unboundFolderCount = 0;

  await db.delete(cloudAssets).where(eq(cloudAssets.mountId, mount.id));

  const item = await getFootprintItemForUser(itemId, userId);
  if (!item) throw new Error('足迹项不存在');

  const files = await listFilesByFullPath(mount.rootPath);
  const folderName = path.posix.basename(mount.rootPath) || mount.rootPath;
  const matched = normalizeName(folderName) === normalizeName(item.title);

  if (matched) {
    matchedFolderCount = 1;
    for (const file of files) {
      const result = await saveCloudFileRecord({
        userId,
        placeTitle: item.title,
        filename: file.name,
        size: file.size,
        sourceRef: file.path,
        sourceFolder: mount.rootPath,
      });
      if (result === 'created') importedAssetCount += 1;
      else skippedAssetCount += 1;
    }
  } else if (files.length > 0) {
    unboundFolderCount = 1;
    await db.insert(cloudAssets).values({
      mountId: mount.id,
      folderId: mount.rootPath,
      folderName,
      assetCount: files.length,
      sampleThumbnailUrl: files[0]?.thumb || files[0]?.url || null,
      status: 'unbound',
      reason: 'no_place_match',
    });
  }

  const summary: SyncSummary = {
    importedAssetCount,
    skippedAssetCount,
    matchedFolderCount,
    unboundFolderCount,
  };

  await db.insert(cloudSyncLogs).values({
    mountId: mount.id,
    status: 'success',
    summaryJson: JSON.stringify(summary),
    errorMessage: null,
  });

  return {
    ok: true,
    summary,
    status: await getFootprintCloudStatus(itemId, userId),
  };
}

export async function bindUnmatchedFolderToItem(itemId: number, userId: number, folderId: string) {
  const item = await getFootprintItemForUser(itemId, userId);
  if (!item) throw new Error('足迹项不存在');

  const [mount] = await db
    .select()
    .from(cloudMounts)
    .where(and(eq(cloudMounts.userId, userId), eq(cloudMounts.footprintItemId, itemId)))
    .orderBy(desc(cloudMounts.id));
  if (!mount) throw new Error('挂载网盘记录不存在');

  const [hint] = await db
    .select()
    .from(cloudAssets)
    .where(and(eq(cloudAssets.mountId, mount.id), eq(cloudAssets.folderId, folderId)));
  if (!hint) throw new Error('未匹配目录不存在');

  const files = await listFilesByFullPath(folderId);
  let importedAssetCount = 0;
  let skippedAssetCount = 0;

  for (const file of files) {
    const result = await saveCloudFileRecord({
      userId,
      placeTitle: item.title,
      filename: file.name,
      size: file.size,
      sourceRef: file.path,
      sourceFolder: folderId,
    });
    if (result === 'created') importedAssetCount += 1;
    else skippedAssetCount += 1;
  }

  await db.delete(cloudAssets).where(and(eq(cloudAssets.mountId, mount.id), eq(cloudAssets.folderId, folderId)));

  return {
    ok: true,
    importedAssetCount,
    skippedAssetCount,
    status: await getFootprintCloudStatus(itemId, userId),
    hints: await listCloudHints(itemId, userId),
  };
}

export async function rollbackBoundFolderFromItem(itemId: number, userId: number) {
  const item = await getFootprintItemForUser(itemId, userId);
  if (!item) throw new Error('足迹项不存在');

  const [mount] = await db
    .select()
    .from(cloudMounts)
    .where(and(eq(cloudMounts.userId, userId), eq(cloudMounts.footprintItemId, itemId)))
    .orderBy(desc(cloudMounts.id));
  if (!mount) throw new Error('挂载网盘记录不存在');

  const files = await listFilesByFullPath(mount.rootPath);
  const folderName = path.posix.basename(mount.rootPath) || mount.rootPath;

  await db
    .delete(storageFiles)
    .where(and(eq(storageFiles.userId, userId), eq(storageFiles.sourceType, 'cloud'), eq(storageFiles.sourceFolder, mount.rootPath)));

  await db.delete(cloudAssets).where(eq(cloudAssets.mountId, mount.id));

  if (files.length > 0) {
    await db.insert(cloudAssets).values({
      mountId: mount.id,
      folderId: mount.rootPath,
      folderName,
      assetCount: files.length,
      sampleThumbnailUrl: files[0]?.thumb || files[0]?.url || null,
      status: 'unbound',
      reason: 'manual_rollback',
    });
  }

  return {
    ok: true,
    removedAssetCount: files.length,
    status: await getFootprintCloudStatus(itemId, userId),
    hints: await listCloudHints(itemId, userId),
  };
}
