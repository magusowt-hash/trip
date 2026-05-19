# Maps 模块开发完成总结

> 以最新代码为准。本文件作为 `maps` 模块当前阶段的最终定稿。

## 当前结论

- `maps` 已从“公共目录集中堆放实现”调整为“地图包 + 公共注册壳层”的结构
- 当前已落地的地图包：
  - `standard-map`
  - `rail-map`
- 后台页面来源于地图包内部
- 前台 `/maps` 页面保持原有布局不变，但右侧栏能力来源于地图包内部
- 地图相关 API 业务逻辑已迁入地图包内部，`app/api` 主要保留原路径入口

## 当前目录结构

```text
src/modules/maps/
├── core/
│   ├── contracts/
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
- 实际后台页面来源：
  - `standard-map/admin`
  - `rail-map/admin`

### 前台

- 公共页面入口：
  - `/maps`
- 页面整体布局仍保留在：
  - `src/app/(shell)/maps/page.tsx`
- 地图包当前负责：
  - 普通地图右侧栏
  - 铁路地图右侧栏

### API

- 保留原路径入口：
  - `/api/maps/search`
  - `/api/maps/selection`
  - `/api/maps/favorites`
  - `/api/maps/footprints`
  - `/api/public/rail-settings`
  - `/api/admin/maps/rail/settings`
- 具体业务逻辑来源：
  - `standard-map/api`
  - `rail-map/api`

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

## 本轮模块化改造结果

- 建立 `maps` 模块公共合同和注册表
- 建立 `standard-map` 与 `rail-map` 两个正式地图包
- 后台从固定页面切换为“注册式挂载”
- 前台保持原布局，但将右侧栏下沉到地图包
- 地图 API 业务逻辑从 `app/api` 迁入地图包
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

## 规范文件

- 地图包接入规范：
  - `docs/team-work/maps/regulation/地图包接入规范.md`

## 后续扩展约束

- 新增地图类型时，必须先在 `src/modules/maps/packages/` 下建立独立地图包
- 后台页面必须来源于地图包内部
- 前台如需扩展，优先通过地图包接入，不要回流到公共目录堆叠
- `src/app/api/...` 只保留路由入口，不继续承载完整地图业务实现
