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
- “添加到某组”链路已补齐共享相册确认逻辑，且“否”时不会再误继承源相册图片。
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
- `users.favorite_lists` 列仍保留在 schema / 数据库中作为历史兼容字段，但榜单地点收藏主读写已迁走。
- `storage_files` 已在代码 schema 中新增 `pixel_width / pixel_height` 字段，但需执行 `drizzle/0013_storage_files_pixel_size.sql` 后数据库才会同步。

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
  - 横图 / 竖图 / 方图混合下的预设间距与组间避让
  - 上传图片链路在执行 0013 迁移后的宽高回填与重排表现

## 当前下一步

- 如需彻底回退数据库，按 `docs/team-work/footprint/to-do list/挂载网盘移除后的数据库待办.md` 执行。
- 后续若重做云端导入能力，应按“导入而非挂载”的新方案重新设计，不复用当前已删除实现。
- 下一轮建议集中补：
  - 本地映射完整手测回归
  - 排列方案与地图边界的多分辨率验证
  - `done list/` 与剩余 `to-do list/` 的持续归档维护
