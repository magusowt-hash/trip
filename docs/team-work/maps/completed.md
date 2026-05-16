# Maps 模块开发完成总结

> 以最新代码为准，以下为 `/maps` 模块的最终状态。

---

## 文件清单

| 文件 | 职责 |
|------|------|
| `src/app/(shell)/maps/page.tsx` | 地图页面主组件 |
| `src/app/(shell)/maps/maps-page.module.css` | 地图页面样式 |
| `src/components/PlanMap.tsx` | 高德地图通用封装组件 |
| `src/components/layout/navTabs.ts` | 侧边栏导航（含「地图」入口） |
| `src/components/layout/ShellLayout.tsx` | Shell 布局（/maps 纳入宽布局） |
| `src/app/api/maps/search/route.ts` | 高德 v5 地点搜索代理 |
| `src/app/api/maps/selection/route.ts` | 高德 v3 逆地理代理 |
| `src/app/api/maps/favorites/route.ts` | 地图 POI 收藏 CRUD |
| `src/app/api/maps/footprints/route.ts` | 地图 POI 足迹 CRUD |
| `src/app/api/maps/_auth.ts` | 地图 API 鉴权共用 |
| `src/db/schema.ts` | 数据库表定义（map_pois 等） |
| `drizzle/0005_maps_poi.sql` | 数据库迁移 |

---

## 页面布局（最终版）

```
┌──────────────────────────────────────────────────────────┐
│  左侧（mapCol）                 │  右侧（listCol）         │
│                                │  ┌────────────────────┐  │
│                                │  │ [普通地图][中国铁路] │⋯│ ← 滚动页签 + 详情
│                                │  │ [种类C] [种类D] ←──→│  │    间隔 6px
│                                │  └────────────────────┘  │
│     高德地图                   │  ┌────────────────────┐  │
│     默认中心 105, 37           │  │ 搜索地点        ◉  │  │ ← CSS 放大镜
│     zoom 4 ≈ 1000km           │  └────────────────────┘  │
│     （全幅，无遮挡）           │  ┌────────────────────┐  │
│                                │  │ 结果卡片列表        │  │
│                                │  │ 收藏 | 加入足迹     │  │
│                                │  └────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

- 页签为横向可滑动列表（`overflow-x: auto`），按钮宽度随文字自适应
- 详情按钮 `⋯` 在滑动列表右侧外，`flex-shrink: 0` 固定，与列表间隔 6px
- 左侧地图初始中心 `[105, 37]`，zoom 4，约 1000km 视野
- 无结果时不显示任何空状态文字

---

## 交互流程

### 搜索
1. 右侧搜索框输入关键词 → 高德 v5 文本搜索 API → 8 条结果
2. 单条结果自动选中并聚焦；多条结果地图自动适配范围
3. 搜索结果卡片可点击选中 → 地图聚焦该点

### 地图点击（最终方案：高德事件自带 POI）
- 点击高德已有标注点 → `hotspotclick` / `click` 事件携带 `event.poi`
- 无需调用 `/api/maps/selection`，即时响应
- 鼠标悬停 POI 时自动变为 `pointer` 光标
- 命中后地图弹出操作卡片（名称 + 地址 + 收藏/足迹按钮），不进入右侧列表

### 收藏 / 足迹
- 独立表 `user_map_favorites` / `user_map_footprints`
- 不绑定榜单地点，纯 POI 维度
- 首次操作自动 upsert POI 到 `map_pois`，再写入关联表
- 已收藏/已足迹的按钮 disabled 并显示灰态

### 中国铁路
- 独立页签 + 地图占位 + 右侧说明
- 未混入普通地图逻辑，预留专题接入

### 详情弹窗
- 点击 `⋯` 按钮弹出
- 展示「普通地图」/「中国铁路」两张卡片，点击切换 activeTab

---

## 高德 Key 方案

| 位置 | Key | 类型 |
|------|-----|------|
| PlanMap.tsx（JS API 加载） | `64138cb3827187cd053ccbb9eaa18fa2` | Web端(JS API) |
| search/route.ts | `fbf5d9a8e346f93257eb7c5ab4d32034` | Web服务 |
| selection/route.ts | `fbf5d9a8e346f93257eb7c5ab4d32034` | Web服务 |

---

## 数据库

```sql
map_pois              -- POI 地点（amap_poi_id, name, lng, lat, address, city, district, type, source）
user_map_favorites    -- 用户收藏（user_id, poi_id, unique constraint）
user_map_footprints   -- 用户足迹（user_id, group_id, poi_id, unique constraint）
```

已执行迁移，表均存在于 `trip` 数据库。

---

## 关键修复记录

| 问题 | 修复 |
|------|------|
| 高德 Key `USERKEY_PLAT_NOMATCH` | 分离前后端 Key（JS API / Web 服务） |
| search v5 API 无 `status` 字段 | 改用 `infocode === '10000'` 判断 |
| selection `city` 返回空数组 `[]` | `typeof === 'string'` 判断 + province 兜底 |
| mapPickMode 闭包过期 | 改用 `useRef` 持有最新值 |
| PlanMap 双重点击 + InfoWindow 泄漏 | 合并 handler，ref 管理生命周期 |
| onMapPoiSelect / onMapLoad 闭包过期 | 全部改用 ref 持有 |
| pickModeOpen 状态变量已删但 JSX 残留 | 移除死代码 |
| merge 冲突标记残留 | 清除 `=======` / `>>>>>>>` |

---

## 运行环境

- 前端：PM2 `next dev -p 3001`，文件变更自动热更新
- 后端 API：Next.js App Router 内联
- 数据库：MySQL 127.0.0.1:3306，已执行全部迁移
