# 实际 Migration SQL 草案

## 目标

- 基于当前收敛版数据库方案，给出第一阶段可执行的 migration SQL 草案
- 覆盖最小必要改动，不引入冗余表
- 为后续正式编写 `drizzle/*.sql` 提供直接参考

## 第一阶段最小范围

### 必做

1. 扩展 `storage_files`
2. 新建 `cloud_mounts`
3. 新建 `cloud_sync_logs`

### 条件做

4. 新建 `cloud_assets`

说明：

- `cloud_assets` 仅在“未匹配资源需要入库”这个前提下启用
- 按当前已确认方向，建议纳入第一阶段

## Migration A：扩展 `storage_files`

### 目的

- 让云端同步图片进入当前正式展示主表
- 保留本地上传与云端来源区分

### SQL

```sql
ALTER TABLE storage_files
  ADD COLUMN source_type varchar(16) NOT NULL DEFAULT 'local' AFTER frame_y,
  ADD COLUMN source_ref varchar(1024) NULL AFTER source_type,
  ADD COLUMN source_folder varchar(255) NULL AFTER source_ref;
```

### 新增索引

```sql
CREATE INDEX sf_user_source_idx
ON storage_files (user_id, source_type);
```

```sql
CREATE UNIQUE INDEX sf_user_source_ref_unique
ON storage_files (user_id, source_type, source_ref);
```

## 关于 `sf_user_source_ref_unique`

说明：

- 本地数据默认 `source_type='local'`
- 本地数据默认 `source_ref IS NULL`
- MySQL 允许唯一索引中的多条 `NULL`
- 因此不会与历史数据冲突

## 保留旧唯一键

第一阶段不移除：

- `sf_user_file_unique (user_id, place_title, filename)`

原因：

- 现有本地上传逻辑风险未知
- 先让云端同步通过 `source_ref` 收敛幂等
- 后续观察稳定后，再评估是否废除旧唯一键

## Migration B：新建 `cloud_mounts`

### 目的

- 保存足迹项挂载状态
- 驱动菜单颜色、弹窗状态、连接状态

### SQL

```sql
CREATE TABLE cloud_mounts (
  id int NOT NULL AUTO_INCREMENT,
  user_id int NOT NULL,
  group_item_id int NOT NULL,
  provider varchar(32) NOT NULL DEFAULT 'alist',
  root_path varchar(512) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active',
  last_checked_at timestamp NULL DEFAULT NULL,
  last_synced_at timestamp NULL DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY cloud_mounts_group_item_unique (group_item_id),
  KEY cloud_mounts_user_id_idx (user_id),
  KEY cloud_mounts_status_idx (status)
);
```

## `cloud_mounts` 字段口径

- `group_item_id`
  - 对应 `footprint_group_items.id`
- `provider`
  - 第一阶段默认 `alist`
- `root_path`
  - 当前用户挂载网盘根路径
- `status`
  - `active / disconnected / disabled`

## Migration C：新建 `cloud_sync_logs`

### 目的

- 保存每次手动同步结果
- 支撑同步结果面板

### SQL

```sql
CREATE TABLE cloud_sync_logs (
  id int NOT NULL AUTO_INCREMENT,
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
  finished_at timestamp NULL DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY cloud_sync_logs_user_id_idx (user_id),
  KEY cloud_sync_logs_mount_id_idx (mount_id),
  KEY cloud_sync_logs_started_at_idx (started_at)
);
```

## Migration D：条件新建 `cloud_assets`

### 目的

- 承接未匹配目录下的轻量资源记录
- 不进入正式展示

### SQL

```sql
CREATE TABLE cloud_assets (
  id int NOT NULL AUTO_INCREMENT,
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
  PRIMARY KEY (id),
  UNIQUE KEY cloud_assets_mount_source_ref_unique (mount_id, source_ref),
  KEY cloud_assets_user_id_idx (user_id),
  KEY cloud_assets_mount_id_idx (mount_id),
  KEY cloud_assets_status_idx (status),
  KEY cloud_assets_folder_name_idx (folder_name)
);
```

## 推荐执行顺序

### Step 1

执行 Migration A：

- 扩展 `storage_files`
- 增加新索引

### Step 2

执行 Migration B：

- 新建 `cloud_mounts`

### Step 3

执行 Migration C：

- 新建 `cloud_sync_logs`

### Step 4

按实现需要执行 Migration D：

- 新建 `cloud_assets`

## 推荐 drizzle 文件拆分

建议拆为三份：

### `drizzle/0009_cloud_storage_extension.sql`

内容：

- `storage_files` 增列
- `sf_user_source_idx`
- `sf_user_source_ref_unique`

### `drizzle/0010_cloud_mounts_and_logs.sql`

内容：

- `cloud_mounts`
- `cloud_sync_logs`

### `drizzle/0011_cloud_assets.sql`

内容：

- `cloud_assets`

说明：

- `cloud_assets` 独立拆分，方便按开发节奏决定是否立即启用

## 推荐上线顺序

### 第一批上线

- Migration A
- Migration B
- Migration C

说明：

- 先让挂载状态、同步结果、正式展示主表准备好

### 第二批上线

- Migration D

说明：

- 若未匹配资源提示要保留到数据库，再补这一批

## 执行前检查项

### 1. 检查 `storage_files` 是否存在脏数据

确认：

- 现有表中没有违反当前唯一键的历史异常

### 2. 检查现网代码是否依赖旧唯一键报错

确认：

- 上传逻辑不会因为新增 `source_type/source_ref` 而行为异常

### 3. 检查 `source_ref` 生成规则

确认：

- 云端同步能稳定拿到相对路径或稳定引用

### 4. 检查 `cloud_folder` 使用方式

确认：

- 现有 `footprint_group_items.cloud_folder` 没有被其他逻辑以不同语义使用

## 回滚建议

### 若 Migration A 后代码未上线

可保留字段不使用，不必急于回滚。

### 若 Migration B/C 后代码未上线

新表对现有逻辑无影响，可保留。

### 若 Migration D 后代码未上线

新表仅空置，不影响当前业务。

说明：

- 这也是第一阶段收敛设计的优势：新增改动对现有功能侵入很低

## 不建议在这批 migration 中做的事

- 删除 `sf_user_file_unique`
- 修改 `footprint_group_items` 表结构
- 修改 `alist_config` 表结构
- 新建第二套正式展示图片表
- 新建 projection 表

## 结论

第一阶段的实际 migration SQL 应严格保持最小：

- `storage_files` 补来源字段
- 增加云端幂等索引
- 新建挂载状态表
- 新建同步日志表
- 按需新建未匹配资源轻量表

这样既能支持当前 Footprint 接入云端挂载，又不会让数据库结构变冗杂。

## 下一步建议

- 开始把这份 SQL 草案翻成实际 `drizzle/*.sql`
- 或补“前端组件结构草案”方便前后端并行
