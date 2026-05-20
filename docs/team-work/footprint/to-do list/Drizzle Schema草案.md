# Drizzle Schema 草案

## 目标

- 将第一阶段云端挂载方案翻译为可实现的 Drizzle schema 结构
- 与当前项目已有 `Drizzle + MySQL` 风格保持一致
- 为后续迁移文件和接口实现提供直接参考

## 建议文件

- `src/db/schema.cloudAssets.ts`
- `src/db/schema.ts` 中统一导出

说明：

- 第一阶段新表全部放在独立 schema 文件，避免污染现有 `storage_files` 相关定义

## 枚举建议

### RootStatus

```ts
export const cloudRootStatusEnum = mysqlEnum('cloud_root_status', [
  'active',
  'disabled',
  'error',
]);
```

### FolderMatchStatus

```ts
export const cloudFolderMatchStatusEnum = mysqlEnum('cloud_folder_match_status', [
  'matched',
  'unbound',
]);
```

### AssetAccessState

```ts
export const cloudAssetAccessStateEnum = mysqlEnum('cloud_asset_access_state', [
  'ok',
  'expired',
  'forbidden',
  'missing',
]);
```

### AssetSyncState

```ts
export const cloudAssetSyncStateEnum = mysqlEnum('cloud_asset_sync_state', [
  'ready',
  'skipped',
  'error',
]);
```

### BindingSource

```ts
export const footprintCloudBindingSourceEnum = mysqlEnum('footprint_cloud_binding_source', [
  'folder_name_exact',
]);
```

### BindingStatus

```ts
export const footprintCloudBindingStatusEnum = mysqlEnum('footprint_cloud_binding_status', [
  'bound',
]);
```

### Visibility

```ts
export const footprintCloudVisibilityEnum = mysqlEnum('footprint_cloud_visibility', [
  'private',
  'friends',
  'public',
]);
```

### ViewType

```ts
export const footprintViewTypeEnum = mysqlEnum('footprint_view_type', [
  'outer_frame',
  'timeline',
  'gallery_wall',
  'cluster_map',
  'story',
]);
```

### SyncTrigger

```ts
export const cloudSyncTriggerEnum = mysqlEnum('cloud_sync_trigger', [
  'user',
  'admin',
]);
```

### SyncStatus

```ts
export const cloudSyncStatusEnum = mysqlEnum('cloud_sync_status', [
  'success',
  'failed',
]);
```

## 表定义草案

### 1. `cloudAssetRoots`

```ts
export const cloudAssetRoots = mysqlTable(
  'cloud_asset_roots',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull(),
    provider: varchar('provider', { length: 32 }).notNull(),
    rootKey: varchar('root_key', { length: 128 }).notNull(),
    rootPath: varchar('root_path', { length: 512 }).notNull(),
    displayName: varchar('display_name', { length: 128 }).notNull(),
    status: cloudRootStatusEnum('status').notNull().default('active'),
    lastSyncedAt: datetime('last_synced_at', { mode: 'date' }),
    createdAt: datetime('created_at', { mode: 'date' }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at', { mode: 'date' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => new Date()),
  },
  table => ({
    uniqUserRootKey: uniqueIndex('uniq_cloud_asset_roots_user_root_key').on(table.userId, table.rootKey),
    idxUserId: index('idx_cloud_asset_roots_user_id').on(table.userId),
    idxStatus: index('idx_cloud_asset_roots_status').on(table.status),
  }),
);
```

### 2. `cloudAssetFolders`

```ts
export const cloudAssetFolders = mysqlTable(
  'cloud_asset_folders',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    rootId: bigint('root_id', { mode: 'number', unsigned: true }).notNull(),
    userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull(),
    folderName: varchar('folder_name', { length: 255 }).notNull(),
    relativePath: varchar('relative_path', { length: 512 }).notNull(),
    matchStatus: cloudFolderMatchStatusEnum('match_status').notNull().default('unbound'),
    matchedPlaceTitle: varchar('matched_place_title', { length: 255 }),
    assetCount: int('asset_count').notNull().default(0),
    sampleAssetId: bigint('sample_asset_id', { mode: 'number', unsigned: true }),
    lastScannedAt: datetime('last_scanned_at', { mode: 'date' }),
    createdAt: datetime('created_at', { mode: 'date' }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at', { mode: 'date' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => new Date()),
  },
  table => ({
    uniqRootRelativePath: uniqueIndex('uniq_cloud_asset_folders_root_relative_path').on(
      table.rootId,
      table.relativePath,
    ),
    idxUserId: index('idx_cloud_asset_folders_user_id').on(table.userId),
    idxRootId: index('idx_cloud_asset_folders_root_id').on(table.rootId),
    idxMatchStatus: index('idx_cloud_asset_folders_match_status').on(table.matchStatus),
    idxMatchedPlaceTitle: index('idx_cloud_asset_folders_matched_place_title').on(table.matchedPlaceTitle),
  }),
);
```

### 3. `cloudAssets`

```ts
export const cloudAssets = mysqlTable(
  'cloud_assets',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    rootId: bigint('root_id', { mode: 'number', unsigned: true }).notNull(),
    folderId: bigint('folder_id', { mode: 'number', unsigned: true }).notNull(),
    userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull(),
    providerFileId: varchar('provider_file_id', { length: 255 }),
    relativePath: varchar('relative_path', { length: 1024 }).notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    fileExt: varchar('file_ext', { length: 32 }),
    mimeType: varchar('mime_type', { length: 128 }),
    size: bigint('size', { mode: 'number', unsigned: true }),
    width: int('width'),
    height: int('height'),
    checksum: varchar('checksum', { length: 128 }),
    etag: varchar('etag', { length: 255 }),
    thumbRef: varchar('thumb_ref', { length: 1024 }),
    originRef: varchar('origin_ref', { length: 1024 }),
    capturedAt: datetime('captured_at', { mode: 'date' }),
    accessState: cloudAssetAccessStateEnum('access_state').notNull().default('ok'),
    syncState: cloudAssetSyncStateEnum('sync_state').notNull().default('ready'),
    isImage: boolean('is_image').notNull().default(true),
    deletedAt: datetime('deleted_at', { mode: 'date' }),
    lastSeenAt: datetime('last_seen_at', { mode: 'date' }),
    createdAt: datetime('created_at', { mode: 'date' }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at', { mode: 'date' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => new Date()),
  },
  table => ({
    uniqRootRelativePath: uniqueIndex('uniq_cloud_assets_root_relative_path').on(
      table.rootId,
      table.relativePath,
    ),
    idxUserId: index('idx_cloud_assets_user_id').on(table.userId),
    idxRootId: index('idx_cloud_assets_root_id').on(table.rootId),
    idxFolderId: index('idx_cloud_assets_folder_id').on(table.folderId),
    idxAccessState: index('idx_cloud_assets_access_state').on(table.accessState),
    idxSyncState: index('idx_cloud_assets_sync_state').on(table.syncState),
    idxLastSeenAt: index('idx_cloud_assets_last_seen_at').on(table.lastSeenAt),
  }),
);
```

### 4. `footprintCloudBindings`

```ts
export const footprintCloudBindings = mysqlTable(
  'footprint_cloud_bindings',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull(),
    folderId: bigint('folder_id', { mode: 'number', unsigned: true }).notNull(),
    assetId: bigint('asset_id', { mode: 'number', unsigned: true }).notNull(),
    placeTitle: varchar('place_title', { length: 255 }).notNull(),
    groupId: bigint('group_id', { mode: 'number', unsigned: true }),
    bindingSource: footprintCloudBindingSourceEnum('binding_source')
      .notNull()
      .default('folder_name_exact'),
    bindingStatus: footprintCloudBindingStatusEnum('binding_status').notNull().default('bound'),
    visibility: footprintCloudVisibilityEnum('visibility').notNull().default('private'),
    createdAt: datetime('created_at', { mode: 'date' }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at', { mode: 'date' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => new Date()),
  },
  table => ({
    uniqAssetId: uniqueIndex('uniq_footprint_cloud_bindings_asset_id').on(table.assetId),
    idxUserId: index('idx_footprint_cloud_bindings_user_id').on(table.userId),
    idxFolderId: index('idx_footprint_cloud_bindings_folder_id').on(table.folderId),
    idxPlaceTitle: index('idx_footprint_cloud_bindings_place_title').on(table.placeTitle),
    idxBindingStatus: index('idx_footprint_cloud_bindings_binding_status').on(table.bindingStatus),
  }),
);
```

### 5. `footprintViewProjections`

```ts
export const footprintViewProjections = mysqlTable(
  'footprint_view_projections',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull(),
    assetId: bigint('asset_id', { mode: 'number', unsigned: true }).notNull(),
    viewType: footprintViewTypeEnum('view_type').notNull().default('outer_frame'),
    layoutKey: varchar('layout_key', { length: 64 }).notNull().default('default'),
    x: double('x'),
    y: double('y'),
    z: double('z'),
    width: double('width'),
    height: double('height'),
    angle: double('angle'),
    extraJson: json('extra_json'),
    createdAt: datetime('created_at', { mode: 'date' }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at', { mode: 'date' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => new Date()),
  },
  table => ({
    uniqAssetViewLayout: uniqueIndex('uniq_footprint_view_projections_asset_view_layout').on(
      table.assetId,
      table.viewType,
      table.layoutKey,
    ),
    idxUserId: index('idx_footprint_view_projections_user_id').on(table.userId),
    idxAssetId: index('idx_footprint_view_projections_asset_id').on(table.assetId),
    idxViewType: index('idx_footprint_view_projections_view_type').on(table.viewType),
  }),
);
```

### 6. `cloudAssetSyncLogs`

```ts
export const cloudAssetSyncLogs = mysqlTable(
  'cloud_asset_sync_logs',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    rootId: bigint('root_id', { mode: 'number', unsigned: true }).notNull(),
    userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull(),
    triggeredBy: cloudSyncTriggerEnum('triggered_by').notNull(),
    syncStatus: cloudSyncStatusEnum('sync_status').notNull(),
    scannedFolderCount: int('scanned_folder_count').notNull().default(0),
    importedAssetCount: int('imported_asset_count').notNull().default(0),
    skippedAssetCount: int('skipped_asset_count').notNull().default(0),
    matchedFolderCount: int('matched_folder_count').notNull().default(0),
    unboundFolderCount: int('unbound_folder_count').notNull().default(0),
    errorCode: varchar('error_code', { length: 64 }),
    errorMessage: varchar('error_message', { length: 255 }),
    startedAt: datetime('started_at', { mode: 'date' }).notNull(),
    finishedAt: datetime('finished_at', { mode: 'date' }),
    createdAt: datetime('created_at', { mode: 'date' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  table => ({
    idxUserId: index('idx_cloud_asset_sync_logs_user_id').on(table.userId),
    idxRootId: index('idx_cloud_asset_sync_logs_root_id').on(table.rootId),
    idxStartedAt: index('idx_cloud_asset_sync_logs_started_at').on(table.startedAt),
  }),
);
```

## 建议关系定义

```ts
export const cloudAssetRootsRelations = relations(cloudAssetRoots, ({ many }) => ({
  folders: many(cloudAssetFolders),
  assets: many(cloudAssets),
  syncLogs: many(cloudAssetSyncLogs),
}));

export const cloudAssetFoldersRelations = relations(cloudAssetFolders, ({ one, many }) => ({
  root: one(cloudAssetRoots, {
    fields: [cloudAssetFolders.rootId],
    references: [cloudAssetRoots.id],
  }),
  assets: many(cloudAssets),
  bindings: many(footprintCloudBindings),
}));

export const cloudAssetsRelations = relations(cloudAssets, ({ one, many }) => ({
  root: one(cloudAssetRoots, {
    fields: [cloudAssets.rootId],
    references: [cloudAssetRoots.id],
  }),
  folder: one(cloudAssetFolders, {
    fields: [cloudAssets.folderId],
    references: [cloudAssetFolders.id],
  }),
  bindings: many(footprintCloudBindings),
  projections: many(footprintViewProjections),
}));
```

说明：

- 是否完整定义所有 relation，可按当前项目习惯裁剪
- 第一阶段核心是表和索引先稳定

## 建议导出方式

在 `src/db/schema.ts` 中增加：

```ts
export {
  cloudAssetRoots,
  cloudAssetFolders,
  cloudAssets,
  footprintCloudBindings,
  footprintViewProjections,
  cloudAssetSyncLogs,
} from './schema.cloudAssets';
```

## 迁移文件建议顺序

### Migration 1

- 创建所有 enum
- 创建 `cloud_asset_roots`
- 创建 `cloud_asset_folders`
- 创建 `cloud_assets`

### Migration 2

- 创建 `footprint_cloud_bindings`
- 创建 `footprint_view_projections`
- 创建 `cloud_asset_sync_logs`

说明：

- 若当前迁移风格不使用 enum type，而是 varchar + 代码约束，也可改成与现有项目完全一致
- 上述草案优先表达结构意图

## 与现有表的边界

- 不修改 `storage_files`
- 不修改现有 `footprint_group_items`
- 第一阶段通过应用层聚合 DTO 混合本地和云端资源

## 实现注意点

### bigint mode

- 若现有项目大量使用 `number` 模式且 ID 不会超 JS 安全范围，可继续 `mode: 'number'`
- 若担心未来增长，需评估是否改为 `bigint` 字符串模式

### json 字段

- `extraJson` 可先保留为空
- 若当前项目对 MySQL json 使用较少，可先用 `text` 存序列化字符串

### enum 落地风格

- 若现有仓库已经偏向 `varchar + TypeScript union`，不要强行引入一整套 DB enum
- 保持仓库一致性优先

## 下一步可继续细化

- `schema.cloudAssets.ts` 的完整可提交版本
- 首批 migration SQL 草案
- 服务层 upsert 示例
