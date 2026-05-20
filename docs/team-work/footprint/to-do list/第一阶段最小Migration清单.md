# 第一阶段最小 Migration 清单

## 目标

- 基于收敛版数据库方案，给出第一阶段最小可执行 migration 范围
- 明确哪些表改、哪些表新增、哪些索引要调整
- 尤其收口 `storage_files` 的唯一键调整策略，避免影响现有本地图片逻辑

## 第一阶段最小改动原则

- 不新增完整平行云端资源体系
- 正式展示继续只走 `storage_files`
- 复用 `footprint_group_items.cloud_folder`
- 新增最少的新表支撑挂载状态与同步结果
- 未匹配资源如果必须入库，再加轻量 `cloud_assets`

## 建议 migration 范围

### 必做

1. 扩展 `storage_files`
2. 新建 `cloud_mounts`
3. 新建 `cloud_sync_logs`

### 条件做

4. 新建 `cloud_assets`

说明：

- 若实现阶段决定未匹配资源先不持久化，只做同步结果摘要，可暂缓 `cloud_assets`
- 但按当前已确认方向，建议仍纳入第一阶段

## Migration 1：扩展 `storage_files`

### 目的

- 让云端同步图片可以进入当前正式展示体系
- 同时保留本地上传和云端来源区分

### 新增字段

```sql
ALTER TABLE storage_files
  ADD COLUMN source_type varchar(16) NOT NULL DEFAULT 'local',
  ADD COLUMN source_ref varchar(1024) NULL,
  ADD COLUMN source_folder varchar(255) NULL;
```

### 字段语义

- `source_type`
  - `local` 或 `cloud`
- `source_ref`
  - 云端文件的相对路径或稳定引用
- `source_folder`
  - 云端一级目录名

## `storage_files` 唯一键问题

当前唯一键：

- `sf_user_file_unique (user_id, place_title, filename)`

这个唯一键对本地图片勉强可用，但对云端同步不稳定，原因：

- 同一文件在地点调整后 `place_title` 可能变化
- 云端目录改名或重新匹配后，不能只靠 `filename` 保证幂等
- 不同目录下可能有同名文件

## 推荐迁移策略

### 不建议直接一步替换为新唯一键

原因：

- 现网代码可能依赖原组合唯一逻辑
- 直接删除原唯一键风险偏高

### 建议采用“过渡期双索引策略”

第一阶段：

1. 保留原唯一键
2. 新增云端来源唯一键

```sql
CREATE UNIQUE INDEX sf_user_source_ref_unique
ON storage_files (user_id, source_type, source_ref);
```

说明：

- 对 `source_type='cloud'` 的记录，靠 `source_ref` 收敛幂等
- 对旧本地记录，仍走原唯一逻辑

### 过渡期注意点

- MySQL 唯一索引允许多个 `NULL`
- 因此本地记录 `source_ref = NULL` 不会和旧数据冲突
- 云端记录必须确保 `source_ref` 非空

## 推荐额外索引

```sql
CREATE INDEX sf_user_source_idx
ON storage_files (user_id, source_type);
```

说明：

- 方便快速过滤本地/云端图片

## Migration 2：新建 `cloud_mounts`

### 目的

- 承接足迹项挂载状态
- 驱动菜单颜色、弹窗状态、最近同步信息归属

### SQL 草案

```sql
CREATE TABLE cloud_mounts (
  id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id int NOT NULL,
  group_item_id int NOT NULL,
  provider varchar(32) NOT NULL DEFAULT 'alist',
  root_path varchar(512) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active',
  last_checked_at timestamp NULL,
  last_synced_at timestamp NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY cloud_mounts_group_item_unique (group_item_id),
  KEY cloud_mounts_user_id_idx (user_id),
  KEY cloud_mounts_status_idx (status)
);
```

## 字段解释

- `group_item_id`
  - 对应 `footprint_group_items.id`
- `provider`
  - 第一阶段固定可用 `alist`
- `root_path`
  - 当前用户云端根路径
- `status`
  - `active / disconnected / disabled`

## Migration 3：新建 `cloud_sync_logs`

### 目的

- 保存每次手动同步摘要
- 支撑同步结果面板和最近同步状态

### SQL 草案

```sql
CREATE TABLE cloud_sync_logs (
  id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id int NOT NULL,
  mount_id int NOT NULL,
  sync_status varchar(16) NOT NULL,
  imported_asset_count int NOT NULL DEFAULT 0,
  matched_folder_count int NOT NULL DEFAULT 0,
  unbound_folder_count int NOT NULL DEFAULT 0,
  skipped_asset_count int NOT NULL DEFAULT 0,
  error_code varchar(64) NULL,
  error_message varchar(255) NULL,
  started_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at timestamp NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY cloud_sync_logs_user_id_idx (user_id),
  KEY cloud_sync_logs_mount_id_idx (mount_id),
  KEY cloud_sync_logs_started_at_idx (started_at)
);
```

## Migration 4：条件新建 `cloud_assets`

### 是否需要

如果你坚持：

- 未匹配目录下图片要先入库

那么建议建。

如果后续实现决定：

- 未匹配只保留目录摘要，不保留单图资源

则可以暂缓。

### SQL 草案

```sql
CREATE TABLE cloud_assets (
  id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id int NOT NULL,
  mount_id int NOT NULL,
  folder_name varchar(255) NOT NULL,
  relative_path varchar(1024) NOT NULL,
  file_name varchar(255) NOT NULL,
  size bigint NOT NULL DEFAULT 0,
  status varchar(16) NOT NULL DEFAULT 'unbound',
  source_ref varchar(1024) NOT NULL,
  last_seen_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY cloud_assets_mount_source_ref_unique (mount_id, source_ref),
  KEY cloud_assets_user_id_idx (user_id),
  KEY cloud_assets_mount_id_idx (mount_id),
  KEY cloud_assets_status_idx (status),
  KEY cloud_assets_folder_name_idx (folder_name)
);
```

## 推荐执行顺序

### Step 1

先扩展 `storage_files` 字段。

原因：

- 云端正式展示最终要落回该表

### Step 2

新增 `cloud_mounts`。

原因：

- 前台菜单状态和弹窗状态都依赖它

### Step 3

新增 `cloud_sync_logs`。

原因：

- 同步动作一落地就需要结果摘要

### Step 4

根据实现选择是否加 `cloud_assets`。

## 推荐拆分成的迁移文件

### 迁移文件 A

- `storage_files` 增列
- 新增 `sf_user_source_ref_unique`
- 新增 `sf_user_source_idx`

### 迁移文件 B

- 新建 `cloud_mounts`
- 新建 `cloud_sync_logs`

### 迁移文件 C`

- 新建 `cloud_assets`

说明：

- 把 `cloud_assets` 独立拆开，便于按实现决定是否落地

## 数据兼容性说明

### 对现有 `storage_files` 的影响

旧数据默认：

- `source_type = 'local'`
- `source_ref = NULL`
- `source_folder = NULL`

不会影响当前读逻辑。

### 对现有页面的影响

如果前端和接口暂时不读新增字段：

- 页面行为保持不变

### 对现有唯一键的影响

第一阶段不强删原唯一键，因此：

- 本地上传逻辑不必立刻重写
- 云端同步逻辑可新增按 `source_ref` 幂等收敛

## 不建议在第一阶段做的 migration

- 删除 `sf_user_file_unique`
- 重构 `footprint_group_items`
- 给 `storage_files` 拆出第二套 projection 表
- 新建完整 `cloud_asset_roots / cloud_asset_folders / footprint_cloud_bindings`

## 迁移风险点

### 风险 1：`storage_files` 旧插入逻辑未设置 `source_type`

缓解：

- 通过默认值 `local` 解决

### 风险 2：云端同步时 `source_ref` 为空

缓解：

- 代码层强制校验
- `source_type='cloud'` 时禁止空 `source_ref`

### 风险 3：旧唯一键仍可能阻止某些云端写入

场景：

- 同一用户、同一地点、同名文件，但来自不同云端目录

缓解：

- 同步写入前先检查是否会撞旧唯一键
- 若会撞，优先考虑把 `filename` 按安全规则改写，或在实现层重新评估旧唯一键的废除时机

说明：

- 这是第一阶段最需要提前验证的数据库风险

## 推荐实现前验证

在正式写 migration 前，先确认：

1. 当前 `storage_files` 插入逻辑是否依赖旧唯一键报错行为
2. 当前是否存在需要同地点保存大量同名图片的真实场景
3. 云端同步是否统一能拿到稳定 `source_ref`

## 收敛建议

如果你要进一步降低第一阶段风险：

- 可以先不上 `cloud_assets`
- 只做：
  - `storage_files` 扩展
  - `cloud_mounts`
  - `cloud_sync_logs`

然后未匹配目录只在同步结果里按目录摘要提示。

但这会和你之前“未匹配图片先入库”的要求有出入。

## 结论

第一阶段最小 migration 应严格收敛为：

- 扩展 `storage_files`
- 新建 `cloud_mounts`
- 新建 `cloud_sync_logs`
- 视需求增加轻量 `cloud_assets`

其中最关键、最需要谨慎评估的是：

- `storage_files` 新旧唯一键共存期间的兼容性

## 下一步建议

- 基于这份清单，继续补“`storage_files` 唯一键平滑迁移方案”
- 或直接开始写实际 migration SQL
