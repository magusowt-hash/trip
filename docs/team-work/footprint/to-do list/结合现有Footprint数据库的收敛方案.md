# 结合现有 Footprint 数据库的收敛方案

## 目标

- 基于当前项目已经存在的 Footprint / Storage / AList 表结构收敛方案
- 避免为了云端挂载再建一套过重、平行的数据库体系
- 保持第一阶段可落地，同时不给后续多形态扩展埋太多技术债

## 当前已有表结构

### 1. `footprint_groups`

现状：

- 已有用户的足迹分组
- 字段：`user_id / name / is_default / sort_order`

作用：

- 表示用户有哪些足迹项或足迹组

### 2. `footprint_group_items`

现状：

- 已有足迹分组与地点项的关系
- 关键字段：
  - `group_id`
  - `list_item_id`
  - `cloud_folder`
  - `cloud_cover`

作用：

- 已经天然具备“某个足迹地点项绑定一个云端目录”的语义基础

### 3. `storage_files`

现状：

- 已有用户图片表
- 关键字段：
  - `user_id`
  - `place_title`
  - `filename`
  - `frame_x`
  - `frame_y`

作用：

- 已经是当前 OuterFrame 视图的核心图片来源
- 已经承载“地点归属 + 外框坐标”

### 4. `alist_config`

现状：

- 已有 AList 全局配置

作用：

- 已能作为第一阶段云端 provider 接入基础

## 核心判断

如果完全照此前“roots / folders / assets / bindings / projections / sync_logs”全量新建，会和当前库产生明显重叠：

- `footprint_group_items.cloud_folder` 已经能表达足迹项与云端目录绑定
- `storage_files.place_title` 已经能表达图片所属地点
- `storage_files.frame_x/frame_y` 已经能表达 OuterFrame 布局

如果再新建一套：

- `footprint_cloud_bindings`
- `footprint_view_projections`

第一阶段很容易出现两套真相源：

- 一套在 `storage_files`
- 一套在新云端表

这就是需要避免的冗杂点。

## 收敛结论

第一阶段不要引入完整的独立云端投影体系。  
应采用：

- **最大复用现有表**
- **只补最少的新表**
- **把云端图片最终收敛进当前 `storage_files` 视图模型**

## 推荐收敛模型

### 保留并继续使用

- `footprint_groups`
- `footprint_group_items`
- `storage_files`
- `alist_config`

### 只新增最小表

建议只新增两张表：

1. `cloud_mounts`
2. `cloud_sync_logs`

如确实需要更强的资源跟踪，再考虑可选第三张：

3. `cloud_assets`

但第一阶段不建议一开始就上满所有 roots / folders / bindings / projections 表。

## 为什么这样收敛

### 1. 足迹项与网盘的绑定，现有 `footprint_group_items` 已能承接

因为你已经明确：

- 每个挂载网盘仅支持一个足迹项
- 网盘根目录第一层必须是地点文件夹名

这意味着：

- `footprint_group_items.cloud_folder`
  - 可以继续表示该足迹地点项绑定到的云端目录

第一阶段不需要再发明一层“folder binding”表。

### 2. 当前 Footprint 展示依赖 `storage_files`

当前 OuterFrame 已经围绕：

- `place_title`
- `frame_x/frame_y`

工作。

因此云端图片如果最终也要进入当前显示方式，最不冗杂的路线是：

- 同步时把云端图片收敛成当前页面能直接消费的数据
- 而不是让页面同时读 `storage_files` 和另一套云端 projection

### 3. `frame_x/frame_y` 不应双写

如果新建 `footprint_view_projections`，同时又保留 `storage_files.frame_x/frame_y`，第一阶段马上就会遇到：

- 本地图坐标写哪张表
- 云端图坐标写哪张表
- 混合展示时页面怎么统一

这会直接增加复杂度。

第一阶段更合理的是：

- 当前 OuterFrame 继续只认一套坐标字段
- 也就是继续认 `storage_files.frame_x/frame_y`

## 第一阶段推荐数据库设计

## A. 继续复用 `footprint_group_items`

不新增目录绑定表，直接复用已有字段：

- `cloud_folder`
  - 表示该足迹地点项对应的云端一级目录
- `cloud_cover`
  - 继续作为封面缓存

说明：

- 这与现有 AList 设计完全一致
- 也符合“一个足迹项关联一个网盘目录”的现阶段约束

## B. 继续复用 `storage_files`

第一阶段云端图片同步后，建议最终也进入 `storage_files` 视图体系。

但为了避免和本地上传混淆，建议对 `storage_files` 做**最小补字段**，而不是另起一套表。

建议新增字段：

- `source_type`
  - `local | cloud`
- `source_ref`
  - 云端图片唯一引用，如相对路径或 provider file id
- `source_folder`
  - 所属云端一级目录名

说明：

- `place_title` 仍然沿用现有字段
- `frame_x/frame_y` 仍然沿用现有字段
- `filename` 仍可沿用，但云端图需结合 `source_ref` 做唯一识别

## C. 最小新增 `cloud_mounts`

用途：

- 记录“哪个足迹项/地点项挂载了哪个网盘目录空间”
- 记录连接状态

建议字段：

- `id`
- `user_id`
- `group_item_id`
- `provider`
- `root_path`
- `status`
  - `active / disconnected / disabled`
- `last_checked_at`
- `last_synced_at`
- `created_at`
- `updated_at`

说明：

- 这个表只负责挂载关系和状态，不负责图片本身
- 避免把连接状态塞进 `footprint_group_items`

## D. 最小新增 `cloud_sync_logs`

用途：

- 保留手动同步摘要
- 支撑弹窗中的最近同步结果

建议字段：

- `id`
- `user_id`
- `mount_id`
- `sync_status`
- `imported_asset_count`
- `matched_folder_count`
- `unbound_folder_count`
- `skipped_asset_count`
- `error_code`
- `error_message`
- `started_at`
- `finished_at`

说明：

- 这张表很轻，但对前台反馈很有价值

## 可选表：`cloud_assets`

只有在你确认下面需求很强时，才建议新增：

- 需要记录“已扫描但未进入正式展示的云端图片”
- 需要单独管理未匹配资源
- 需要保留远端资源状态，而不希望污染 `storage_files`

如果第一阶段只追求尽快落地，也可以不建 `cloud_assets`，而是：

- 已匹配图片写入 `storage_files`
- 未匹配目录只写入 `cloud_sync_logs` 摘要或轻量缓存

但按你前面要求：

- “未匹配目录下图片先入库，但状态为未绑定”

那么第一阶段建议保留一个**轻量版** `cloud_assets`，只做未匹配与同步追踪，不做完整 projection/binding 体系。

## 最终推荐的最小模型

### 必要

- 复用：`footprint_group_items`
- 复用：`storage_files`
- 新增：`cloud_mounts`
- 新增：`cloud_sync_logs`

### 条件新增

- `cloud_assets`

### 明确不建议第一阶段新增

- `cloud_asset_roots`
- `cloud_asset_folders`
- `footprint_cloud_bindings`
- `footprint_view_projections`

原因：

- 这些和现有数据库重叠度高
- 第一阶段收益不足以覆盖复杂度成本

## 推荐同步写入策略

### 已匹配目录

处理：

1. 通过目录名命中当前足迹地点
2. 将目录下图片同步为 `storage_files`
3. `place_title` 直接写命中的地点名
4. `source_type='cloud'`
5. `source_ref` 写云端相对路径或稳定文件 ID

效果：

- 当前 OuterFrame 无需改成双轨读模型
- 本地和云端图天然可统一展示

### 未匹配目录

处理：

1. 不写入正式 `storage_files`
2. 写入 `cloud_assets` 轻量记录，标记 `unbound`
3. 在弹窗和待匹配入口中提示

效果：

- 正式展示数据保持干净
- 未匹配资源仍然可追踪

## 这样收敛后的真相源

### 正式展示真相源

- `storage_files`

### 挂载状态真相源

- `cloud_mounts`

### 同步结果真相源

- `cloud_sync_logs`

### 未匹配资源真相源

- `cloud_assets`（若启用）

### 足迹项与云端目录关系真相源

- `footprint_group_items.cloud_folder`

## 对前面设计的修正建议

此前文档中的长期方向可以保留为“未来演进思路”，但第一阶段实施时应明确：

- 不做完整独立投影层
- 不做完整独立 binding 层
- 不让当前页面同时依赖 `storage_files` 和另一套云端 projection 表

这样才能避免数据库和接口冗杂。

## 推荐第一阶段表改动最小集

### 修改 `storage_files`

建议新增：

- `source_type varchar(16) default 'local'`
- `source_ref varchar(1024) null`
- `source_folder varchar(255) null`

建议唯一键调整为：

- 从 `(user_id, place_title, filename)`
- 调整为更能兼容云端来源的组合

推荐方向：

- `(user_id, source_type, source_ref)` 用于云端
- 本地图可保留原唯一逻辑，或补充兼容索引

说明：

- 这一点需要实现时谨慎设计，避免破坏现有本地上传唯一性

### 新增 `cloud_mounts`

用于菜单颜色、弹窗状态、挂载关系。

### 新增 `cloud_sync_logs`

用于同步结果面板。

### 条件新增 `cloud_assets`

仅用于未匹配资源与轻量资源追踪。

## 结论

结合当前真实数据库，第一阶段最合理的路线不是“另起一整套云端足迹数据库”，而是：

- 用 `footprint_group_items` 承接挂载目录关系
- 用 `storage_files` 继续承接正式展示图片
- 只新增最少的挂载状态与同步日志表
- 需要未匹配资源入库时，再补一个轻量 `cloud_assets`

这样既不冗杂，也不会把当前 Footprint 的现有实现推翻重来。

## 下一步建议

- 重新按这个收敛模型改写 `Drizzle Schema` 草案
- 重新收敛第一阶段 migration 范围
- 明确 `storage_files` 的最小字段扩展方案
