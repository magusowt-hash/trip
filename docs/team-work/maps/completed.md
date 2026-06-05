# Maps 模块开发完成总结

> 以最新代码为准。本文件作为 `maps` 模块当前阶段的最终定稿。

## 当前结论

- `maps` 已从“公共目录集中堆放实现”调整为“地图包 + 公共注册壳层”的结构
- 当前已落地的地图包：
  - `standard-map`
  - `rail-map`
  - `china-nature-map`
- 后台页面来源于地图包内部
- 后台地图包总入口已切换为“数据库配置 + 代码注册表合并”模式
- 前台 `/maps` 页面保持原有布局不变，但右侧栏能力来源于地图包内部
- 前台地图类型列表不再直接写死，改为受后台地图包启停状态驱动
- 地图相关 API 业务逻辑已迁入地图包内部，`app/api` 主要保留原路径入口

## 当前目录结构

```text
src/modules/maps/
├── core/
│   ├── contracts/
│   ├── server/
│   └── registry/
├── packages/
│   ├── standard-map/
│   │   ├── admin/
│   │   ├── api/
│   │   ├── frontend/
│   │   └── index.ts
│   └── rail-map/
│       ├── admin/
│       ├── api/
│       ├── frontend/
│       └── index.ts
└── index.ts
```

## 当前运行边界

### 后台

- 统一入口：
  - `/management/maps`
- 动态挂载：
  - `/management/maps/standard`
  - `/management/maps/rail`
- 地图包状态来源：
  - `map_packages`
- 实际后台页面来源：
  - `standard-map/admin`
  - `rail-map/admin`
  - `china-nature-map/admin`
- 当前后台首页支持：
  - 启用 / 停用地图包
  - 编辑地图包名称
  - 编辑排序
- 当前后台首页视觉已收敛为轻量卡片，不再展示描述文案

### 前台

- 公共页面入口：
  - `/maps`
- 页面整体布局仍保留在：
  - `src/app/(shell)/maps/page.tsx`
- 地图类型来源：
  - `/api/public/maps/packages`
- 地图包当前负责：
  - 普通地图右侧栏
  - 铁路地图右侧栏
  - 中国自然地图专题入口流与专题地图壳
- 当前前台约束：
  - 只展示“已启用且代码已注册前台能力”的地图包
  - 停用地图包在前台完全隐藏
  - 默认激活第一个可用地图包
  - 加载态文案统一使用“加载中……”

### API

- 保留原路径入口：
  - `/api/maps/search`
  - `/api/maps/selection`
  - `/api/maps/favorites`
  - `/api/maps/footprints`
  - `/api/public/rail-settings`
  - `/api/public/maps/packages`
  - `/api/admin/maps/rail/settings`
  - `/api/admin/maps/packages`
  - `/api/admin/maps/packages/[slug]`
- 具体业务逻辑来源：
  - `standard-map/api`
  - `rail-map/api`
  - `maps/core/server/map-package-service.ts`

## standard-map 当前职责

- 后台占位管理页
- 前台右侧栏：
  - 搜索地点
  - 搜索结果列表
  - 收藏
  - 加入足迹
- API 逻辑：
  - 搜索
  - 选点
  - 收藏
  - 足迹
- 包内共享逻辑：
  - 地图用户鉴权
  - POI upsert

## rail-map 当前职责

- 后台管理页：
  - 铁路地图设置
  - 站点覆盖管理
- 前台右侧栏：
  - 站点搜索
  - 搜索结果列表
- API 逻辑：
  - 公开铁路设置
  - 后台铁路设置

## china-nature-map 当前职责

- 后台管理页：
  - 中国自然地图专题入口管理
  - 维护标题、封面图 URL、排序、启停
- 前台右侧栏：
  - 单列大图专题入口流
  - 玻璃条标题覆盖
  - 专题切换后的地图壳占位
- API 逻辑：
  - 后台专题入口项读取
  - 后台专题入口项保存
- 当前边界：
  - 只做 UI 壳层
  - 不接真实自然标注数据
  - 不切换底图

## 数据依赖

### 普通地图

- `map_pois`
- `user_map_favorites`
- `user_map_footprints`
- `footprintGroups` 相关表

### 铁路地图

- `rail_map_settings`
- `station_overrides`
- 静态文件：
  - `/data/railways.json`
  - `/data/stations.json`

### 地图包状态

- `map_packages`
  - `slug`
  - `name`
  - `description`
  - `is_enabled`
  - `sort_order`

### 中国自然地图专题入口

- 当前为 package-local UI-first 配置
- 字段语义：
  - `topicSlug`
  - `title`
  - `coverImageUrl`
  - `sortOrder`
  - `isEnabled`
- 当前阶段先通过包内轻量存储承接后台编辑，不接数据库

## 本轮模块化改造结果

- 建立 `maps` 模块公共合同和注册表
- 建立 `standard-map` 与 `rail-map` 两个正式地图包
- 后台从固定页面切换为“注册式挂载”
- 前台保持原布局，但将右侧栏下沉到地图包
- 地图 API 业务逻辑从 `app/api` 迁入地图包
- 新增地图包状态表与后台启停能力
- 新增后台地图包名称、排序编辑
- 前台地图类型切换改为由后台地图包列表驱动
- 新增 `china-nature-map` UI-only 地图包
- 新增中国自然地图专题入口流与专题地图壳
- 新增中国自然地图后台专题入口项管理页与 package-local admin API
- 清理废弃入口：
  - `src/app/api/maps/_auth.ts`
  - `src/app/management/maps/rail/page.tsx`

## 当前公共区职责

- 地图包协议
- 注册表
- 地图包查询
- 模块总出口

## 当前不进入公共区的内容

- 普通地图专属前台右栏逻辑
- 普通地图专属 API 逻辑
- 铁路地图专属后台页面
- 铁路地图专属设置逻辑
- 铁路地图专属前台右栏逻辑
- 中国自然地图未来真实标注数据与专题绘制逻辑

## 规范文件

- 地图包接入规范：
  - `docs/team-work/maps/regulation/地图包接入规范.md`

## 后续扩展约束

- 新增地图类型时，必须先在 `src/modules/maps/packages/` 下建立独立地图包
- 新增地图类型后，必须确保 `map_packages` 中存在对应记录；如缺失，应用层会按注册表自动补齐默认项
- 后台页面必须来源于地图包内部
- 前台是否展示，不再由代码中的 `admin.enabled` 单独决定，而由“数据库启用状态 + 前台能力注册”共同决定
- 前台如需扩展，优先通过地图包接入，不要回流到公共目录堆叠
- 像 `china-nature-map` 这类“同底图下切换专题”的产品形态，可以先作为单一地图包内部专题配置实现，不必过早拆成多个独立底图包
- `src/app/api/...` 只保留路由入口，不继续承载完整地图业务实现
