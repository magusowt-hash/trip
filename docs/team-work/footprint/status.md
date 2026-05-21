# footprint 状态板

## 当前可用入口

- `/user/footprints`
- `/footprints`
- `/management/footprints`
- `/api/footprints/groups`
- `/api/footprints/groups/[id]`
- `/api/footprints/groups/[id]/items`
- `/api/footprints/default/items`
- `/api/footprints/settings`
- `/api/footprints/view`
- `/api/admin/footprints`

## 当前状态

- Footprint 分组、默认已去、外框展示设置、管理端查看入口仍保留。
- 已删除本轮落地的“挂载网盘”用户端入口、管理端入口、服务层实现和接口实现。
- `storage_files` 代码侧已回退为本地上传模型，不再通过当前代码路径承接 cloud 来源图片。
- AList 相关数据库扩展与 migration 历史文件暂未删除，后续通过数据库待办文档统一处理。

## 已删除范围

- 用户端：
  - 足迹项菜单中的 `挂载网盘`
  - 挂载弹窗
  - 待匹配提示入口
- 管理端：
  - 挂载网盘提示查看
  - 重试同步
  - 绑定未匹配目录
  - 回退已绑定图片
- 接口与服务：
  - `/api/footprints/cloud/*`
  - `src/services/footprint-cloud.ts`
  - `src/db/schema.cloud.ts`
- 存储桥接：
  - `storage_files` 中本轮加入的 cloud 来源字段已从代码 schema 移除
  - `src/services/storage.ts` 已回退为本地文件读取链路

## 当前已知差异

- `drizzle/0009_cloud_storage_extension.sql`
- `drizzle/0010_cloud_mounts_and_logs.sql`
- `drizzle/0011_cloud_assets.sql`
- `drizzle/meta/_journal.json`

以上历史 migration 仍在仓库内，但当前代码已不再消费对应结构。

## 当前是否允许 push

- 不允许 push

## 当前是否完成联调

- 不涉及，挂载网盘代码已移除

## 当前是否完成真实环境验证

- 未完成

## 当前下一步

- 如需彻底回退数据库，按 `docs/team-work/footprint/to-do list/挂载网盘移除后的数据库待办.md` 执行。
- 后续若重做云端导入能力，应按“导入而非挂载”的新方案重新设计，不复用当前已删除实现。
