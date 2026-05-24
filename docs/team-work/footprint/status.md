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

- Footprint 分组、默认组、外框展示设置、管理端查看入口仍保留。
- 榜单地点收藏主来源已从 `users.favorite_lists` 收敛为 `user_list_favorites`。
- 默认足迹组当前已合并展示：
  - 榜单页“已去”
  - 普通地图页“已去”
- 普通地图页用户侧文案已统一为“已去”，并已接入足迹页默认组、分享视图、后台查看链路。
- 普通地图“已去”当前在用户端已支持：
  - 默认组展示
  - 相册查看
  - 图片上传
  - 从组内移除
  - 添加到其他已去组
- 已删除旧“挂载网盘 / AList”用户端入口、管理端入口、服务层实现和接口实现。
- 当前本地目录映射方案已接入 `/user/footprints`，支持：
  - 目录扫描
  - 已匹配地点导入
  - 未匹配目录提示
  - 缺失文件警告
  - 主文件夹记录恢复
  - 映射弹窗内三种图片排列方案
  - 图片真实宽高参与预设排布
  - 精准匹配 + 单向模糊匹配确认
- “添加到某组”链路已补齐共享相册确认逻辑，且“否”时不会再误继承源相册图片。
- 足迹组管理中的批量添加/删除已改为批量接口，成功后使用局部状态更新与右上角短提示，不再刷新影响观感。
- 本地映射主文件夹记录与资源记录当前已切换为数据库方案：
  - 主文件夹记录：`local_map_roots`
  - 资源记录：`local_map_assets`
  - 资源记录直接绑定 `footprint_item_id`
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
- `drizzle/0014_user_map_footprints_group_scope.sql`
- `drizzle/0015_local_map_records.sql`
- `users.favorite_lists` 列仍保留在 schema / 数据库中作为历史兼容字段，但榜单地点收藏主读写已迁走。
- `storage_files` 已在代码 schema 中新增 `pixel_width / pixel_height` 字段，但需执行 `drizzle/0013_storage_files_pixel_size.sql` 后数据库才会同步。
- `user_map_footprints` 已在代码侧允许同一用户同一 POI 进入多个组，但需执行 `0014` 迁移后真实数据库才会同步。
- 本地映射主文件夹记录已从测试期文本存储切换到数据库表 `local_map_roots / local_map_assets`，需执行 `0015` 迁移后真实数据库才会同步。

以上历史 migration 仍在仓库内，但当前代码已不再消费对应结构。

## 当前是否允许 push

- 允许小范围 debug / 热修复 / 单点修正直接 push
- 结构性改动仍建议在负责人确认后统一补文档和状态板

## 当前是否完成联调

- 不涉及，挂载网盘代码已移除

## 当前是否完成真实环境验证

- 已完成多轮页面级调试与定向修复
- 仍缺一轮系统化真实环境手测回归
- 本轮仍建议重点补测：
  - 普通地图“已去”写入后刷新回显
  - 默认足迹组展示榜单项与普通地图项混合数据
  - 普通地图“已去”相册上传、删除、跨组复用
  - 普通地图“已去”跨组写入在执行 `0014` 迁移后的真实库表现
  - 横图 / 竖图 / 方图混合下的预设间距与组间避让
  - 本地映射精准匹配 / 单向模糊匹配 / 取消确认链路
  - 本地映射数据库化后，保存位置与刷新恢复链路
  - 上传图片链路在执行 0013 迁移后的宽高回填与重排表现

## 当前下一步

- 当前 `footprint/to-do list/` 已清理旧方案稿，历史待办已迁入 `done list/` 归档。
- 后续 `footprint/to-do list/` 只保留当前仍需实现的事项，内容仅写实现内容及方式，不再继续维护过于复杂的长稿。
- 下一轮建议集中补：
  - 执行并验证 `0014`、`0015` 数据库迁移
  - 本地映射完整手测回归
  - 排列方案与地图边界的多分辨率验证
  - 映射本地时模糊匹配增加“文件夹名长度大于等于 2”限制
