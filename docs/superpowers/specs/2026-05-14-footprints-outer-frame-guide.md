# 足迹页 OuterFrame 矢量层开发文档

## 架构概览

```
UserFootprintsPage
└── Suspense
    └── UserFootprintsPageInner
        ├── OuterFrame (全屏外层)
        │   ├── div (容器, 滚轮/手势缩放平移)
        │   │   ├── MapContainer (AMap, z:1)
        │   │   ├── LineCanvas (连线层, z:2, pointer-events:none)
        │   │   └── OuterFrameCanvas (照片层, z:3)
        │   └── div (缩放指示器)
        ├── FootprintGroupPanel (右下, 可折叠)
        ├── LegendPanel (右下, 图例设置)
        ├── PhotoAlbumModal (相册弹窗)
        └── ImageViewer (照片查看器)
```

## 坐标系统

```
screenX = logicalX * scale + viewportW/2 + tx
screenY = logicalY * scale + viewportH/2 + ty
```

- `(tx, ty)`: 屏幕平移量，初始 0
- `scale`: 缩放比，范围 0.2~5，在 50% 处有门控（缩放至 50% 时停留 500ms 后才可继续缩小）
- `(viewportW/2, viewportH/2)` 为视口中心
- 逻辑原点 (0,0) 在 scale=1, tx=0 时位于视口中心

## 关键文件

| 文件 | 用途 |
|------|------|
| `src/app/(shell)/user/footprints/page.tsx` | 主页面，数据加载 + 状态管理 + view 模式 |
| `src/components/OuterFrame.tsx` | 外层容器，集成地图 + 画布 + 手势 |
| `src/components/OuterFrameCanvas.tsx` | Canvas 渲染引擎（照片、地点名、拖放、脏标记） |
| `src/components/LineCanvas.tsx` | 独立连线层，每帧渲染 |
| `src/components/FootprintGroupPanel.tsx` | 分类组面板，受控折叠状态 |
| `src/components/LegendPanel.tsx` | 设置面板（显示开关+样式设置，折叠分区，颜色选择器） |
| `src/components/PhotoAlbumModal.tsx` | 相册网格弹窗 |
| `src/hooks/useOuterFrame.ts` | 滚轮/手势缩放平移 hook |
| `src/lib/outerFrameCoords.ts` | 坐标转换 + zoomAt 工具函数 |
| `src/db/schema.footprintSettings.ts` | 用户设置表 |
| `src/app/api/footprints/settings/route.ts` | 设置 GET/PATCH API |
| `src/app/api/footprints/view/route.ts` | View token 生成 + 代理数据 API |
| `src/app/api/storage/photos/[id]/position/route.ts` | 照片位置批量保存 API |
| `src/app/api/storage/file/route.ts` | 文件服务（支持 admin cookie 绕过权限） |

## 数据库变更

### storage_files 扩展
```sql
ALTER TABLE storage_files ADD COLUMN frame_x DOUBLE;
ALTER TABLE storage_files ADD COLUMN frame_y DOUBLE;
```

### user_footprint_settings 新建
```sql
CREATE TABLE user_footprint_settings (
  user_id INT PRIMARY KEY,
  show_photos TINYINT DEFAULT 1,
  show_lines TINYINT DEFAULT 1,
  show_labels TINYINT DEFAULT 1,
  show_poi_labels TINYINT DEFAULT 1,
  show_title TINYINT DEFAULT 1,
  panel_collapsed TINYINT DEFAULT 0,
  background_color VARCHAR(16) DEFAULT '#0f172a',
  line_color VARCHAR(16) DEFAULT '#a5b4fc',
  line_width DOUBLE DEFAULT 2,
  line_dashed TINYINT DEFAULT 1,
  poi_label_color VARCHAR(16) DEFAULT '#000000',
  marker_color VARCHAR(16) DEFAULT '#ef4444',
  marker_shape VARCHAR(16) DEFAULT 'pin'
);
```

## View Token 方案（管理端 / 未来分享）

管理端查看他人足迹不再传 `?userId=X` + localStorage token，改为：

1. 管理端 `POST /api/footprints/view` 传入 `{ user_id }` + admin Bearer token
2. 服务端生成 30 分钟有效 `base64url` token，返回 `{ token, url }`
3. 新标签打开 `/user/footprints?view={token}`
4. 页面 `isViewMode` 检测 → 所有 API 走 `/api/footprints/view?token=X&type=...`

**优点**：token 自包含授权信息，无需跨标签共享 localStorage，可复用为分享功能。

---

## 错误经验总结

### 1. React State 块被误删
**现象**: `ReferenceError: Can't find variable: showPhotos`

**原因**: 多次编辑替换代码块时，state 声明（useState）跟随被替换文本被删除。

**避免方案**:
- 每次编辑后用 `grep -n 'useState' page.tsx` 检查 state 声明完整性
- 用完整函数替换而非片段替换
- 编辑后立即 `curl` 测试页面 HTTP 状态码

### 2. CSS 层叠上下文导致 Portal
**现象**: FootprintGroupPanel 内 `position:fixed` 弹窗无法正常交互

**原因**: 父元素 `backdrop-filter: blur()` 创建新的层叠上下文，`fixed` 元素被限制在面板内而非视口

**避免方案**:
- 使用 `createPortal(children, document.body)` 将叠加层渲染到 body
- 避免在需要全屏叠加的容器上使用 `backdrop-filter`、`transform`、`will-change` 等创建层叠上下文的属性

### 3. 坐标公式 viewport 中心偏移
**现象**: 缩放不以鼠标位置为中心

**原因**: 原 `pinchZoom` 公式为 `tx = center - (center - oldTx) * ratio`，但坐标模型是 `screen = logical*scale + Vw/2 + tx`，视口中心 (Vw/2) 未在 pinchZoom 中体现

**修正**: 改为 `zoomAt` 公式 `tx = (cx - Vw/2) - (cx - Vw/2 - oldTx) * ratio`

### 4. Canvas 脏标记导致拖拽不跟手
**现象**: 拖拽照片时画布不跟随刷新

**原因**: 渲染用 `useRef` 脏标记，但 `useEffect` 仅在 props 引用变化时设脏，拖拽中 props 引用不变

**避免方案**:
- 拖拽时直接设 `dirtyRef.current = true`
- rAF 循环中检查 `dragRef.current` 存在时强制渲染
- 每帧计算坐标用 `computePlaceRects()` 而非缓存的 `useMemo`

### 5. MySQL SUM(bigint) 返回字符串导致计算错误
**现象**: 上传 1MB 即报超出 5GB 上限

**原因**: Drizzle ORM 中 `sql<number>\`SUM(bigint)\`` 类型断言为 number，但 MySQL 实际返回字符串。`"1048576" + 2097152` = `"10485762097152"` > 5GB

**避免方案**:
- 始终用 `Number(row?.total)` 显式转换
- API 端也用 `Number()` 包裹从 DB 返回的聚合值

### 6. Drizzle onDuplicateKeyUpdate 兼容性问题
**现象**: settings PATCH API 返回 500

**原因**: `insert().values().onDuplicateKeyUpdate()` 在当前版本行为不确定

**修正**: 改为先 SELECT 判断存在，再分支执行 UPDATE 或 INSERT

### 7. Canvas 滚轮监听未生效
**现象**: 页面滚轮无响应

**原因**: `containerRef` 是普通 ref，赋值不触重渲染，`useEffect` 在 ref 赋值前执行导致事件未挂载

**修正**: 改用 `useState<HTMLElement>` + callback ref 确保挂载后附加监听

### 8. useSearchParams 须 Suspense 包裹
**现象**: 页面返回 404

**原因**: Next.js App Router 要求 `useSearchParams()` 在 `<Suspense>` 边界内使用

**修正**: 用 Suspense fallback 包裹调用 useSearchParams 的组件

### 9. 意外事件冒泡导致全局平移
**现象**: 拖拽照片时整个页面跟随移动

**原因**: OuterFrame 容器的 `onPointerMove` 与 Canvas 的拖拽 handler 同时触发

**修正**:
- Canvas `pointerdown` 命中照片时 `e.stopPropagation()` 阻止冒泡
- 仅拖拽状态下 stopPropagation，空白区域允许穿透

### 10. 照片位置跨 session 持久化
**现象**: 关闭后再打开，照片位置重置

**修正方案**:
- 拖拽结束不自动保存，改为累积标记 `hasMovedPhotos`
- 右下角显示「保存位置」按钮
- 点击后 `POST /api/storage/photos/0/position` 批量保存 `frame_x/frame_y`
- 下次加载从 DB 读取坐标

### 11. View模式照片位置用 snake_case 读 Drizzle 数据
**现象**: 管理端查看他人足迹，照片位置与用户保存的不一致，全部回到自动排列位置

**原因**: 客户端代码误用 DB 列名 `f.frame_x` 读取 Drizzle 返回行。Drizzle `db.select()` 返回 camelCase 属性（`frameX`），`f.frame_x` 为 `undefined`，导致所有照片被当作未放置重新自动排列

**修正**: 统一使用 `f.frameX` / `f.frameY`

### 12. View模式文件 API 403 导致照片不显示
**现象**: 管理端查看他人足迹，照片显示为彩色占位块而非真实图片

**原因**: `/api/storage/file` 校验 `uid !== auth.userId` 返回 403。admin cookie 下 `auth.userId` 为 admin 自身 ID，而非目标用户 ID

**修正**: 文件 API 增加 `isAdmin()` 检测（读取 `trip_admin` cookie），admin 请求直接放行

### 13. View token 生成接口误读 auth 来源
**现象**: 管理端 POST 生成 view token 返回「未授权」

**原因**: `getAdminTokenFromRequest` 仅读 cookie，但管理端前端通过 `Authorization: Bearer` 头发送 admin token

**修正**: POST handler 同时支持 cookie 和 `Authorization` header 两种来源

---

## 2026-05-15 更新记录

### 缩放门控

缩放范围由 0.5~5 改为 0.2~5。在 50% 处设有门控：
- 缩小越过 50% 时停在 50%，启动 500ms 定时器
- 500ms 后或已在 50% 再次缩小，可继续缩小至 20%
- 放大超过 50% 时重新锁门

文件：`src/hooks/useOuterFrame.ts`, `src/lib/outerFrameCoords.ts`

### POI 地图标签

连线地图端新增地点名称标签，可在设置面板控制显隐和颜色：
- `show_poi_labels` — 显示开关
- `poi_label_color` — 标签颜色，默认黑色 `#000000`
- 标签绘制在 POI 点下方偏移处

文件：`src/components/LineCanvas.tsx`

### 标注点多样式

地图标注点支持颜色和形状配置：
- `marker_color` — 颜色，默认红色 `#ef4444`
- `marker_shape` — 形状：`pin`(图钉)/`dot`(圆点)/`diamond`(菱形)，默认 `pin`

文件：`src/components/PlanMap.tsx`

### 右下角面板优化

- 足迹和设置面板折叠时滑入右侧 (`translateX(40px)`)，hover 时滑出
- 点击面板外空白区域自动折叠所有面板
- 设置面板内部分为「显示开关」和「样式设置」两个手风琴分区
- 颜色选择器用 `position: fixed` 全屏遮罩，避免 overflow 裁剪
- 布局改为纵向 (`flex-direction: column-reverse`)，间距 12px
- 缩放百分比 badge 已移除
- LegendPanel 标题「图例」改为「设置」

文件：`src/components/LegendPanel.tsx`, `src/components/FootprintGroupPanel.tsx`, `src/app/(shell)/user/footprints/page.tsx`

### 照片拖动约束

照片不可拖入地图区域（中心 60%×80%）：
- 使用照片完整边框（非中心点）检测与地图框重叠
- 固定逻辑尺寸，不随缩放变化
- 重叠时推到最近边缘外侧

文件：`src/components/OuterFrameCanvas.tsx`

### 保存按钮

保存按钮独立于面板，固定在界面底部居中，文字「保存修改」。

文件：`src/app/(shell)/user/footprints/page.tsx`

### 数据库新增列

| 列名 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `show_poi_labels` | tinyint(1) | 1 | 地图标签显隐 |
| `poi_label_color` | varchar(16) | #000000 | 地图标签颜色 |
| `marker_color` | varchar(16) | #ef4444 | 标注点颜色 |
| `marker_shape` | varchar(16) | pin | 标注点形状 |

迁移文件：`drizzle/0002_show_poi_labels.sql`, `drizzle/0003_poi_label_color.sql`, `drizzle/0004_marker_style.sql`

