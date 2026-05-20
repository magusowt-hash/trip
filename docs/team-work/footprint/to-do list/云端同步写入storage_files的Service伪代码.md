# 云端同步写入 storage_files 的 Service 伪代码

## 目标

- 将当前收敛后的数据库方案翻译为可实现的服务层伪代码
- 验证“云端同步 -> 地点匹配 -> 正式展示入 `storage_files` -> 未匹配入 `cloud_assets`”是否闭环
- 为后续实际编码提供直接参考

## 当前收敛前提

- 正式展示图片唯一真相源仍是 `storage_files`
- 足迹项与云端目录关系继续复用 `footprint_group_items.cloud_folder`
- 挂载状态走 `cloud_mounts`
- 同步结果走 `cloud_sync_logs`
- 未匹配资源走轻量 `cloud_assets`
- 只扫描网盘根目录第一层文件夹
- 一级目录名直接匹配当前足迹地点列表

## 服务拆分建议

第一阶段建议拆成 5 个服务函数：

1. `getMountByGroupItem`
2. `checkMountConnection`
3. `syncMountedCloudFolders`
4. `upsertMatchedCloudFileToStorage`
5. `upsertUnboundCloudAsset`

## 主入口

```ts
type SyncMountedCloudParams = {
  userId: number;
  groupItemId: number;
  triggeredBy: 'user' | 'admin';
};

type SyncMountedCloudResult = {
  importedAssetCount: number;
  matchedFolderCount: number;
  unboundFolderCount: number;
  skippedAssetCount: number;
  startedAt: Date;
  finishedAt: Date;
};

async function syncMountedCloudFootprint(
  params: SyncMountedCloudParams,
): Promise<SyncMountedCloudResult> {
  const startedAt = new Date();

  const mount = await getMountByGroupItem(params.userId, params.groupItemId);
  if (!mount) {
    throw new AppError('CLOUD_NOT_MOUNTED', '当前足迹项尚未挂载网盘');
  }

  await assertMountIsConnected(mount);

  const placeTitles = await getCurrentUserFootprintPlaceTitles(params.userId);
  if (placeTitles.length === 0) {
    throw new AppError('FOOTPRINT_PLACE_LIST_EMPTY', '当前足迹地点为空，无法匹配目录');
  }

  const logId = await createSyncLog({
    userId: params.userId,
    mountId: mount.id,
    syncStatus: 'running',
    startedAt,
  });

  let importedAssetCount = 0;
  let matchedFolderCount = 0;
  let unboundFolderCount = 0;
  let skippedAssetCount = 0;

  try {
    const rootFolders = await listRootFolders(mount);

    for (const folder of rootFolders) {
      const normalizedFolderName = normalizePlaceName(folder.name);
      const matchedPlaceTitle = matchPlaceTitle(normalizedFolderName, placeTitles);

      const files = await listFolderImages(mount, folder.path);

      if (matchedPlaceTitle) {
        matchedFolderCount += 1;

        for (const file of files) {
          const result = await upsertMatchedCloudFileToStorage({
            userId: params.userId,
            mount,
            folderName: folder.name,
            file,
            matchedPlaceTitle,
          });

          if (result === 'imported') importedAssetCount += 1;
          if (result === 'skipped') skippedAssetCount += 1;
        }

        await updateGroupItemCloudFolder({
          userId: params.userId,
          placeTitle: matchedPlaceTitle,
          cloudFolder: folder.path,
        });

        await clearUnboundCloudAssets({
          userId: params.userId,
          mountId: mount.id,
          folderName: folder.name,
        });
      } else {
        unboundFolderCount += 1;

        for (const file of files) {
          const result = await upsertUnboundCloudAsset({
            userId: params.userId,
            mountId: mount.id,
            folderName: folder.name,
            file,
          });

          if (result === 'imported') importedAssetCount += 1;
          if (result === 'skipped') skippedAssetCount += 1;
        }
      }
    }

    const finishedAt = new Date();

    await finalizeSyncLog({
      logId,
      syncStatus: 'success',
      importedAssetCount,
      matchedFolderCount,
      unboundFolderCount,
      skippedAssetCount,
      finishedAt,
    });

    await markMountSynced(mount.id, finishedAt);

    return {
      importedAssetCount,
      matchedFolderCount,
      unboundFolderCount,
      skippedAssetCount,
      startedAt,
      finishedAt,
    };
  } catch (error) {
    const finishedAt = new Date();

    await finalizeSyncLog({
      logId,
      syncStatus: 'failed',
      importedAssetCount,
      matchedFolderCount,
      unboundFolderCount,
      skippedAssetCount,
      errorCode: toErrorCode(error),
      errorMessage: toErrorMessage(error),
      finishedAt,
    });

    await markMountDisconnectedIfNeeded(mount.id, error);
    throw error;
  }
}
```

## 1. 获取挂载关系

```ts
async function getMountByGroupItem(userId: number, groupItemId: number) {
  return db.query.cloudMounts.findFirst({
    where: and(
      eq(cloudMounts.userId, userId),
      eq(cloudMounts.groupItemId, groupItemId),
    ),
  });
}
```

说明：

- `groupItemId` 是当前足迹项主入口
- 不需要先引入更复杂的 root 实体

## 2. 检查连接状态

```ts
async function assertMountIsConnected(mount: CloudMount) {
  const ok = await testAlistConnection({
    rootPath: mount.rootPath,
  });

  if (!ok) {
    await db
      .update(cloudMounts)
      .set({
        status: 'disconnected',
        lastCheckedAt: new Date(),
      })
      .where(eq(cloudMounts.id, mount.id));

    throw new AppError('CLOUD_CONNECT_FAILED', '当前网盘连接失败');
  }

  await db
    .update(cloudMounts)
    .set({
      status: 'active',
      lastCheckedAt: new Date(),
    })
    .where(eq(cloudMounts.id, mount.id));
}
```

## 3. 获取当前用户足迹地点列表

第一阶段不需要引入全站标准地点库，只读取当前用户已有足迹地点。

```ts
async function getCurrentUserFootprintPlaceTitles(userId: number): Promise<string[]> {
  const rows = await db
    .select({
      placeTitle: listItems.title,
    })
    .from(footprintGroups)
    .innerJoin(footprintGroupItems, eq(footprintGroupItems.groupId, footprintGroups.id))
    .innerJoin(listItems, eq(listItems.id, footprintGroupItems.listItemId))
    .where(eq(footprintGroups.userId, userId));

  return Array.from(
    new Set(
      rows
        .map(row => row.placeTitle?.trim())
        .filter(Boolean),
    ),
  ) as string[];
}
```

说明：

- 这里假设现有地点标题来自 `list_items.title`
- 实现前要与现有真实地点表/列表表再对一下

## 4. 地点名标准化与匹配

```ts
function normalizePlaceName(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .toLowerCase();
}

function matchPlaceTitle(folderName: string, placeTitles: string[]): string | null {
  const matched = placeTitles.find(title => normalizePlaceName(title) === folderName);
  return matched ?? null;
}
```

说明：

- 第一阶段仍然是精确匹配
- 只是允许做最小标准化

## 5. 已匹配目录写入 `storage_files`

这是第一阶段最关键的收敛点。

```ts
type UpsertMatchedCloudFileParams = {
  userId: number;
  mount: CloudMount;
  folderName: string;
  matchedPlaceTitle: string;
  file: {
    name: string;
    size: number;
    path: string;
  };
};

async function upsertMatchedCloudFileToStorage(
  params: UpsertMatchedCloudFileParams,
): Promise<'imported' | 'skipped'> {
  const sourceRef = params.file.path;

  if (!sourceRef) {
    return 'skipped';
  }

  const existingCloudRow = await db.query.storageFiles.findFirst({
    where: and(
      eq(storageFiles.userId, params.userId),
      eq(storageFiles.sourceType, 'cloud'),
      eq(storageFiles.sourceRef, sourceRef),
    ),
  });

  const safeFilename = await resolveSafeStorageFilename({
    userId: params.userId,
    placeTitle: params.matchedPlaceTitle,
    originalFilename: params.file.name,
    sourceRef,
  });

  if (existingCloudRow) {
    await db
      .update(storageFiles)
      .set({
        placeTitle: params.matchedPlaceTitle,
        filename: safeFilename,
        size: params.file.size,
        sourceFolder: params.folderName,
      })
      .where(eq(storageFiles.id, existingCloudRow.id));

    return 'imported';
  }

  await db.insert(storageFiles).values({
    userId: params.userId,
    placeTitle: params.matchedPlaceTitle,
    filename: safeFilename,
    size: params.file.size,
    sourceType: 'cloud',
    sourceRef,
    sourceFolder: params.folderName,
  });

  return 'imported';
}
```

## 6. 旧唯一键冲突规避

```ts
async function resolveSafeStorageFilename(params: {
  userId: number;
  placeTitle: string;
  originalFilename: string;
  sourceRef: string;
}): Promise<string> {
  const hasConflict = await db.query.storageFiles.findFirst({
    where: and(
      eq(storageFiles.userId, params.userId),
      eq(storageFiles.placeTitle, params.placeTitle),
      eq(storageFiles.filename, params.originalFilename),
    ),
  });

  if (!hasConflict) {
    return params.originalFilename;
  }

  return appendCloudSuffix(params.originalFilename, shortHash(params.sourceRef));
}
```

```ts
function appendCloudSuffix(filename: string, hash: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0) return `${filename} [c_${hash}]`;

  const name = filename.slice(0, lastDot);
  const ext = filename.slice(lastDot);
  return `${name} [c_${hash}]${ext}`;
}
```

说明：

- 这里只解决第一阶段旧唯一键兼容问题
- 不要求前端理解“原始名”和“安全落库名”两套概念

## 7. 未匹配目录写入轻量 `cloud_assets`

```ts
type UpsertUnboundCloudAssetParams = {
  userId: number;
  mountId: number;
  folderName: string;
  file: {
    name: string;
    size: number;
    path: string;
  };
};

async function upsertUnboundCloudAsset(
  params: UpsertUnboundCloudAssetParams,
): Promise<'imported' | 'skipped'> {
  const sourceRef = params.file.path;
  if (!sourceRef) return 'skipped';

  const existing = await db.query.cloudAssets.findFirst({
    where: and(
      eq(cloudAssets.mountId, params.mountId),
      eq(cloudAssets.sourceRef, sourceRef),
    ),
  });

  if (existing) {
    await db
      .update(cloudAssets)
      .set({
        folderName: params.folderName,
        fileName: params.file.name,
        size: params.file.size,
        status: 'unbound',
        lastSeenAt: new Date(),
      })
      .where(eq(cloudAssets.id, existing.id));

    return 'imported';
  }

  await db.insert(cloudAssets).values({
    userId: params.userId,
    mountId: params.mountId,
    folderName: params.folderName,
    relativePath: params.file.path,
    fileName: params.file.name,
    size: params.file.size,
    status: 'unbound',
    sourceRef,
    lastSeenAt: new Date(),
  });

  return 'imported';
}
```

## 8. 已匹配后清理未匹配缓存

当某目录原来未匹配、这次命中地点后，应清掉该目录下未匹配缓存，避免提示残留。

```ts
async function clearUnboundCloudAssets(params: {
  userId: number;
  mountId: number;
  folderName: string;
}) {
  await db
    .delete(cloudAssets)
    .where(
      and(
        eq(cloudAssets.userId, params.userId),
        eq(cloudAssets.mountId, params.mountId),
        eq(cloudAssets.folderName, params.folderName),
        eq(cloudAssets.status, 'unbound'),
      ),
    );
}
```

## 9. 更新 `footprint_group_items.cloud_folder`

这一步继续复用现有表，而不是额外新建目录绑定表。

```ts
async function updateGroupItemCloudFolder(params: {
  userId: number;
  placeTitle: string;
  cloudFolder: string;
}) {
  const groupItem = await findGroupItemByPlaceTitle(params.userId, params.placeTitle);
  if (!groupItem) return;

  await db
    .update(footprintGroupItems)
    .set({
      cloudFolder: params.cloudFolder,
    })
    .where(eq(footprintGroupItems.id, groupItem.id));
}
```

说明：

- 第一阶段允许“目录命中地点后自动写回 `cloud_folder`”

## 10. 同步日志

```ts
async function createSyncLog(params: {
  userId: number;
  mountId: number;
  syncStatus: 'running';
  startedAt: Date;
}) {
  const result = await db.insert(cloudSyncLogs).values({
    userId: params.userId,
    mountId: params.mountId,
    syncStatus: 'running',
    startedAt: params.startedAt,
  });

  return Number(result.insertId);
}
```

```ts
async function finalizeSyncLog(params: {
  logId: number;
  syncStatus: 'success' | 'failed';
  importedAssetCount: number;
  matchedFolderCount: number;
  unboundFolderCount: number;
  skippedAssetCount: number;
  errorCode?: string;
  errorMessage?: string;
  finishedAt: Date;
}) {
  await db
    .update(cloudSyncLogs)
    .set({
      syncStatus: params.syncStatus,
      importedAssetCount: params.importedAssetCount,
      matchedFolderCount: params.matchedFolderCount,
      unboundFolderCount: params.unboundFolderCount,
      skippedAssetCount: params.skippedAssetCount,
      errorCode: params.errorCode ?? null,
      errorMessage: params.errorMessage ?? null,
      finishedAt: params.finishedAt,
    })
    .where(eq(cloudSyncLogs.id, params.logId));
}
```

## 11. 标记 mount 状态

```ts
async function markMountSynced(mountId: number, finishedAt: Date) {
  await db
    .update(cloudMounts)
    .set({
      status: 'active',
      lastSyncedAt: finishedAt,
      lastCheckedAt: finishedAt,
    })
    .where(eq(cloudMounts.id, mountId));
}
```

```ts
async function markMountDisconnectedIfNeeded(mountId: number, error: unknown) {
  if (!isConnectionLikeError(error)) return;

  await db
    .update(cloudMounts)
    .set({
      status: 'disconnected',
      lastCheckedAt: new Date(),
    })
    .where(eq(cloudMounts.id, mountId));
}
```

## 12. 展示读取策略

### 正式展示

当前 OuterFrame 仍只读：

- `storage_files`

且建议过滤：

- `source_type in ('local', 'cloud')`

不需要第二套页面读取模型。

### 未匹配提示

提示只读：

- `cloud_assets where status = 'unbound'`

并按 `folder_name` 聚合数量。

## 13. 第一阶段最关键的代码约束

### 约束 1

云端已匹配图片必须写入 `storage_files`，否则当前页面就会双轨。

### 约束 2

云端未匹配图片不能直接写入 `storage_files`，否则正式展示会被污染。

### 约束 3

云端同步幂等必须优先依赖：

- `user_id + source_type + source_ref`

### 约束 4

`frame_x/frame_y` 继续只留在 `storage_files`，第一阶段不另起 projection 写路径。

## 14. 推荐错误处理

### 目录扫描失败

- 记录 sync log 失败
- 不清理旧 `storage_files`
- 不把既有资源强行标 missing

### 单文件写入失败

- 记为 `skipped`
- 继续处理后续文件
- 最终同步仍可成功，但摘要中体现跳过数量

### 连接失败

- 更新 `cloud_mounts.status = disconnected`
- 返回 `CLOUD_CONNECT_FAILED`

## 15. 这份伪代码验证了什么

它验证了收敛方案在代码层是顺的：

- 挂载关系不需要一整套 roots/folders 表
- 正式展示不需要第二套图片投影表
- 未匹配资源也有独立落点
- 同步结果与菜单状态都能落到最小新增表

## 下一步建议

- 基于这份伪代码继续补“前端弹窗最终字段表”
- 或直接开始写 migration SQL / service 实现
