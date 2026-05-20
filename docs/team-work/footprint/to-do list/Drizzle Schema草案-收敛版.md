# Drizzle Schema 草案 - 收敛版

## 目标

- 基于当前真实数据库结构，给出第一阶段最小可行的 Drizzle schema 草案
- 避免再引入与 `storage_files`、`footprint_group_items` 平行冲突的表
- 让当前 `OuterFrame footprint` 能最小代价接入云端挂载能力

## 收敛原则

第一阶段：

- 继续复用 `footprint_group_items`
- 继续复用 `storage_files`
- 继续复用 `alist_config`
- 只新增最少的新表

明确不在第一阶段引入：

- `cloud_asset_roots`
- `cloud_asset_folders`
- `footprint_cloud_bindings`
- `footprint_view_projections`

原因：

- 与现有 `cloud_folder / place_title / frame_x / frame_y` 语义重复
- 会导致当前页面出现双轨图片真相源

## 第一阶段建议改动

### 1. 扩展 `storage_files`

用途：

- 让云端同步进来的正式展示图片，仍然进入当前 `storage_files` 体系
- 在不改变页面主模型的情况下区分本地上传和云端来源

建议新增字段：

- `sourceType`
- `sourceRef`
- `sourceFolder`

### 2. 新增 `cloud_mounts`

用途：

- 记录某个足迹项是否已挂载网盘
- 提供菜单状态、弹窗状态、最近连接状态

### 3. 新增 `cloud_sync_logs`

用途：

- 记录每次手动同步结果
- 驱动同步结果面板

### 4. 条件新增 `cloud_assets`

用途：

- 只承接“未匹配资源入库但不进入正式展示”的需求

说明：

- 如果后续决定未匹配资源不必单独入库，可不建此表
- 当前按你的要求，建议保留轻量版

## 文件建议

- 修改：`src/db/schema.storage.ts`
- 新增：`src/db/schema.cloud.ts`
- 修改：`src/db/schema.ts`

## 一、`storage_files` 扩展草案

当前表：

- `id`
- `userId`
- `placeTitle`
- `filename`
- `size`
- `frameX`
- `frameY`
- `createdAt`

建议扩展为：

```ts
import {
  mysqlTable,
  serial,
  int,
  varchar,
  bigint,
  timestamp,
  double,
  uniqueIndex,
  index,
} from 'drizzle-orm/mysql-core';

export const storageFiles = mysqlTable(
  'storage_files',
  {
    id: serial('id').primaryKey(),
    userId: int('user_id').notNull(),
    placeTitle: varchar('place_title', { length: 255 }).notNull(),
    filename: varchar('filename', { length: 500 }).notNull(),
    size: bigint('size', { mode: 'number' }).notNull().default(0),
    frameX: double('frame_x'),
    frameY: double('frame_y'),

    sourceType: varchar('source_type', { length: 16 }).notNull().default('local'),
    sourceRef: varchar('source_ref', { length: 1024 }),
    sourceFolder: varchar('source_folder', { length: 255 }),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    userPlaceIdx: index('sf_user_place_idx').on(t.userId, t.placeTitle),
    userSourceIdx: index('sf_user_source_idx').on(t.userId, t.sourceType),
    userSourceRefIdx: uniqueIndex('sf_user_source_ref_unique').on(t.userId, t.sourceType, t.sourceRef),
    localFallbackIdx: index('sf_user_file_idx').on(t.userId, t.placeTitle, t.filename),
  }),
);
```

## 关于唯一键的收敛建议

当前唯一键：

- `(user_id, place_title, filename)`

这个对本地上传还算可用，但对云端来源不够稳。

推荐收敛方式：

- 新增唯一键：`(user_id, source_type, source_ref)`
- 保留 `(user_id, place_title, filename)` 作为普通索引，不再做主唯一锚点

原因：

- 云端图片更适合按“来源引用”幂等
- 否则目录改名、地点调整时容易冲突

注意：

- 若现网已有大量依赖原唯一键的逻辑，需要迁移前先审查 API 和插入逻辑

## `sourceType` 语义

建议值：

- `local`
- `cloud`

第一阶段不必上数据库 enum，继续用 `varchar` 即可，和现有项目风格更一致。

## `sourceRef` 语义

建议存：

- AList 下的相对文件路径
- 或 provider file id

第一阶段更推荐：

- 用相对路径

原因：

- 现有实现更容易拿到
- 与同步幂等规则一致

## `sourceFolder` 语义

建议存：

- 云端一级目录名

作用：

- 支撑调试
- 支撑未匹配/重匹配时快速定位来源目录

## 二、`cloud_mounts` 草案

用途：

- 表示某个足迹项当前是否挂载了网盘
- 记录连接状态和最近同步状态

建议定义：

```ts
import {
  mysqlTable,
  serial,
  int,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/mysql-core';

export const cloudMounts = mysqlTable(
  'cloud_mounts',
  {
    id: serial('id').primaryKey(),
    userId: int('user_id').notNull(),
    groupItemId: int('group_item_id').notNull(),
    provider: varchar('provider', { length: 32 }).notNull().default('alist'),
    rootPath: varchar('root_path', { length: 512 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    lastCheckedAt: timestamp('last_checked_at'),
    lastSyncedAt: timestamp('last_synced_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    uniqueGroupItem: uniqueIndex('cloud_mounts_group_item_unique').on(t.groupItemId),
    userIdIdx: index('cloud_mounts_user_id_idx').on(t.userId),
    statusIdx: index('cloud_mounts_status_idx').on(t.status),
  }),
);
```

## 字段说明

### `groupItemId`

直接指向：

- `footprint_group_items.id`

原因：

- 你的业务约束是“每个挂载网盘仅支持一个足迹项”
- 这意味着挂载关系天然属于某个 `footprint_group_item`

### `rootPath`

建议存：

- 当前用户在 AList 下用于扫描的根路径

例如：

- `/user_12/`

说明：

- 第一阶段不需要拆成更复杂的 root 实体表

### `status`

建议值：

- `active`
- `disconnected`
- `disabled`

作用：

- 直接驱动菜单颜色与弹窗状态

## 三、`cloud_sync_logs` 草案

用途：

- 保存每次手动同步的摘要

建议定义：

```ts
import {
  mysqlTable,
  serial,
  int,
  varchar,
  timestamp,
  index,
} from 'drizzle-orm/mysql-core';

export const cloudSyncLogs = mysqlTable(
  'cloud_sync_logs',
  {
    id: serial('id').primaryKey(),
    userId: int('user_id').notNull(),
    mountId: int('mount_id').notNull(),
    syncStatus: varchar('sync_status', { length: 16 }).notNull(),
    importedAssetCount: int('imported_asset_count').notNull().default(0),
    matchedFolderCount: int('matched_folder_count').notNull().default(0),
    unboundFolderCount: int('unbound_folder_count').notNull().default(0),
    skippedAssetCount: int('skipped_asset_count').notNull().default(0),
    errorCode: varchar('error_code', { length: 64 }),
    errorMessage: varchar('error_message', { length: 255 }),
    startedAt: timestamp('started_at').notNull().defaultNow(),
    finishedAt: timestamp('finished_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index('cloud_sync_logs_user_id_idx').on(t.userId),
    mountIdIdx: index('cloud_sync_logs_mount_id_idx').on(t.mountId),
    startedAtIdx: index('cloud_sync_logs_started_at_idx').on(t.startedAt),
  }),
);
```

## 字段说明

### `mountId`

指向：

- `cloud_mounts.id`

作用：

- 每个足迹项的挂载独立保留同步历史

### `syncStatus`

建议值：

- `success`
- `failed`

### 这张表不做什么

- 不追踪单张资源状态
- 不做目录级映射真相源
- 只做同步结果摘要

## 四、`cloud_assets` 轻量草案

仅在“未匹配资源需要入库”这个约束下启用。

用途：

- 保存未匹配目录下的资源
- 支撑弹窗和常驻“待匹配”入口

建议定义：

```ts
import {
  mysqlTable,
  serial,
  int,
  varchar,
  bigint,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/mysql-core';

export const cloudAssets = mysqlTable(
  'cloud_assets',
  {
    id: serial('id').primaryKey(),
    userId: int('user_id').notNull(),
    mountId: int('mount_id').notNull(),
    folderName: varchar('folder_name', { length: 255 }).notNull(),
    relativePath: varchar('relative_path', { length: 1024 }).notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    size: bigint('size', { mode: 'number' }).notNull().default(0),
    status: varchar('status', { length: 16 }).notNull().default('unbound'),
    sourceRef: varchar('source_ref', { length: 1024 }).notNull(),
    lastSeenAt: timestamp('last_seen_at').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    uniqueMountSourceRef: uniqueIndex('cloud_assets_mount_source_ref_unique').on(t.mountId, t.sourceRef),
    userIdIdx: index('cloud_assets_user_id_idx').on(t.userId),
    mountIdIdx: index('cloud_assets_mount_id_idx').on(t.mountId),
    statusIdx: index('cloud_assets_status_idx').on(t.status),
    folderNameIdx: index('cloud_assets_folder_name_idx').on(t.folderName),
  }),
);
```

## 收敛说明

这张 `cloud_assets`：

- 不是正式展示主表
- 不承载 `frame_x/frame_y`
- 不承载正式已匹配图片展示

它只做：

- 未匹配目录资源缓存
- 轻量同步跟踪

一旦目录命中地点并正式导入展示，建议将图片写入：

- `storage_files`

而不是继续让页面直接读 `cloud_assets`

## 五、`schema.cloud.ts` 推荐导出

```ts
export { cloudMounts, cloudSyncLogs, cloudAssets } from './schema.cloud';
```

同时在 `src/db/schema.ts` 中补充：

```ts
export { cloudMounts, cloudSyncLogs, cloudAssets } from './schema.cloud';
export { storageFiles } from './schema.storage';
export { footprintGroups, footprintGroupItems } from './schema.footprints';
export { alistConfig } from './schema.alist';
```

## 六、关系定义建议

第一阶段关系保持最小即可。

### `cloudMounts`

- `groupItemId -> footprint_group_items.id`

### `cloudSyncLogs`

- `mountId -> cloud_mounts.id`

### `cloudAssets`

- `mountId -> cloud_mounts.id`

说明：

- 不必在第一阶段把所有 relations 都写满
- 先保证查询路径稳定

## 七、最终推荐的第一阶段最小 schema 变更

### 修改

- `storage_files`

新增：

- `source_type`
- `source_ref`
- `source_folder`

### 新增

- `cloud_mounts`
- `cloud_sync_logs`

### 条件新增

- `cloud_assets`

## 八、为什么这版不冗杂

因为它遵循以下收敛：

- 挂载关系只在 `cloud_mounts`
- 同步结果只在 `cloud_sync_logs`
- 正式展示图片只在 `storage_files`
- 足迹地点绑定继续借助现有 `place_title`
- 足迹项与云端目录关系继续复用 `footprint_group_items.cloud_folder`

没有再造：

- 第二套坐标系统
- 第二套正式展示图片表
- 第二套足迹绑定表

## 九、后续演进空间

如果未来真的需要支持：

- 多种 footprint 形态
- 云端资源不止图片
- 复杂目录规则
- 资源历史追踪

再从这版继续演进到更完整的独立资源域即可。

但第一阶段不应先把数据库设计做重。

## 下一步建议

- 基于这版草案继续产出“第一阶段最小 migration 清单”
- 明确 `storage_files` 现有唯一键如何平滑调整
