# 足迹页外框矢量层设计

## 1. 概述

为足迹（Footprints）页面增加一个独立的矢量层（OuterFrame），作为地图容器的父级。该矢量层嵌套在地图外部，形成环绕地图的环形区域，用于放置用户上传的地点照片。地图标注点（POI）与对应照片区之间通过连线连接。

**核心理念**：OuterFrame 是父级容器，具有独立的缩放/平移能力；地图（AMap）是其子级。OuterFrame 缩放时地图跟随缩放；地图自身缩放不影响 OuterFrame。

### 关键决策（已确认）

| 决策 | 选项 |
|------|------|
| 矢量层位置 | 地图四周的环形外框（Frame/Ring） |
| 缩放关系 | 外框缩放 → 地图跟随；地图缩放 → 外框不变 |
| 照片布局 | 手动拖放为主 + 自动排列辅助 |
| 连线规则 | 每个地点（POI）→ 其照片区画一根连线（1:1），非每张照片一根线 |
| 页面布局 | 全页面改为外框+地图，取代现有左右分栏布局 |
| 图片加载 | 按需加载，照片显示尺寸达到阈值后才加载完整图片 |

---

## 2. 数据层

### 2.1 storage_files 表扩展

在现有 `storage_files` 表增加两列存放外框坐标（x、y 为 OuterFrame 逻辑空间内的像素坐标）：

```sql
ALTER TABLE storage_files
  ADD COLUMN frame_x double DEFAULT NULL,
  ADD COLUMN frame_y double DEFAULT NULL;
```

`(frame_x, frame_y)` 为 NULL 表示照片未放置到外框上。

### 2.2 关联关系

照片通过 `storage_files.place_title` 与 FootprintItem 的地点名称关联。连线的逻辑是：POI 地点名 → 所有该地点的照片（照片区的外框位置取该地点所有照片的位置均值或首个有坐标的照片位置）。

**坐标语义**：`(frame_x, frame_y)` 存储的是 OuterFrame 逻辑空间（未缩放）中的坐标。渲染时乘以当前外层缩放 S 后得到屏幕坐标。

---

## 3. 架构设计

### 3.1 组件树

```
UserFootprintsPage (全屏)
└── OuterFrame (div, CSS transform 控制缩放/平移, 监听 wheel/pointer 事件)
    ├── BackgroundCanvas (canvas, 渲染背景网格/辅助线)
    ├── PhotoCanvas (canvas, 渲染所有照片缩略图, 虚拟化仅渲染视口内)
    ├── LineCanvas (canvas, 渲染所有 POI→照片区 连线, rAF 更新)
    ├── InteractionCanvas (canvas, 处理拖放/点击 hit-test, 透明覆盖层)
    └── MapContainer (div, AMap 挂载点, 位于 OuterFrame 中心区域)
```

### 3.2 坐标系统

```
屏幕坐标 (sx, sy)
    │ 逆变换: sx → ox = (sx - Tx) / S
    ▼
OuterFrame 逻辑坐标 (ox, oy)   ← 照片 frame_x/frame_y 所在空间
    │
    │  POI: lat/lng  →  map.lngLatToContainer()  →  (mx, my)
    │  然后 (mx, my) + (mapLeft, mapTop)  →  (ox, oy)
    ▼
地图容器像素 (mx, my)          ← AMap 容器内部坐标
```

**变换公式**：

| 变换方向 | 公式 |
|---------|------|
| 逻辑→屏幕 | `sx = ox * S + Tx` |
| 屏幕→逻辑 | `ox = (sx - Tx) / S` |
| POI 经纬度→逻辑坐标 | `(ox, oy) = lngLatToContainer(lat, lng) + (mapLeft, mapTop)` |

### 3.3 状态管理

| 状态 | 类型 | 说明 |
|------|------|------|
| `S` (outerScale) | number | OuterFrame 缩放，默认 1，范围 0.2~5（50% 处有门控延迟） |
| `(Tx, Ty)` (outerOffset) | [number, number] | OuterFrame 平移偏移量 |
| `(mapLeft, mapTop)` | [number, number] | 地图在 OuterFrame 中的固定锚点位置 |
| `photoPositions` | Map<photoId, {x, y}> | 每张照片在 OuterFrame 逻辑空间的坐标 |
| `poiLogicalCoords` | Map<poiId, {x, y}> | 每个 POI 在 OuterFrame 逻辑空间的当前坐标（随地图自身变化更新） |

### 3.4 两层缩放协作

```
用户操作        │  OuterFrame              │  MapContainer (AMap)
────────────────┼──────────────────────────┼──────────────────────────
滚轮在 OuterFrame│ S 变化                    │ CSS transform 自动联动
两指捏合         │ Tx, Ty 变化              │ 地图随父级同步缩放/平移
                │                          │
滚轮在 MapContainer│ 不变                   │ map 自身 zoom/center 变化
                │                          │ poiLogicalCoords 重算
                │                          │ LineCanvas 连线更新
```

**事件隔离**：MapContainer 的 wheel 事件由 AMap 内部消费（`stopPropagation`）。当鼠标/触摸点在 MapContainer 区域内时不触发 OuterFrame 缩放。

### 3.5 地图布局约束

- MapContainer 始终居中于 OuterFrame 逻辑空间的 (0, 0) 位置
- MapContainer 的 CSS 宽高为视口百分比（如 70vw × 70vh），随 OuterFrame 缩放对应缩放
- 初始 `Tx, Ty` 使 MapContainer 的屏幕位置居中于窗口

---

## 4. 渲染层

### 4.1 PhotoCanvas（照片渲染）

采用**虚拟化渲染**：仅绘制视口内可见的照片，视口外照片跳过。

```
renderPhotos(viewport: {left, top, right, bottom}) {
  for each photo where photo.logicalPos intersects viewport:
    根据当前 outerScale S 计算显示尺寸
    加载策略:
      - displaySize < 64px   → 纯色占位方块（无网络请求）
      - 64px ≤ displaySize < 128px → 加载缩略图（服务端中转压缩到 128px）
      - displaySize ≥ 128px  → 加载原图
    每个照片区是一个圆角矩形图片 + 地点名称标签
    drawImage() 到 canvas
}
```

**LOD 阈值**：上述 64px / 128px 阈值可配置。关键收益——缩小态不产生数百个网络请求。

### 4.2 LineCanvas（连线渲染）

每次 requestAnimationFrame 内批量更新所有连线：

```
renderLines() {
  清空 LineCanvas
  for each POI:
    计算 POI 在 OuterFrame 逻辑空间的当前坐标
    查找该 POI 对应的照片区中心坐标
    绘制贝塞尔曲线连接两端
}
```

**连线数量** = POI 数量（每个地点一根线），不是照片数。100 个地点就是 100 根线。

**性能**：100 根贝塞尔曲线在一帧内绘制，Canvas 完全可支撑 60fps。

### 4.3 渲染调度

```
requestAnimationFrame 循环:
  1. 检查 dirty flags (outerScale / outerOffset / poiCoords 是否变化)
  2. 若无变化，跳过
  3. 清空 LineCanvas
  4. 遍历 POI 列表，绘制连线
  5. 若 outerScale 变化较大（>10%）或 outerOffset 变化较大（>50px），重新计算视口并重绘 PhotoCanvas
```

---

## 5. 交互层

### 5.1 OuterFrame 手势

| 手势 | 操作 | 实现 |
|------|------|------|
| 滚轮 | 以鼠标位置为中心缩放 | `S *= (1 + deltaY * 0.001)`, 同步调整 Tx, Ty |
| 双指捏合 (移动端) | 两指中心缩放 | `touchend` 计算 pinch distance 变化率 |
| 单指/鼠标拖拽 | 平移 | `pointermove` 更新 Tx, Ty |
| 双击照片 | 放大聚焦该照片区 | 动画过渡 S → targetS, Tx/Ty 平移到照片居中 |

**缩放门控**：缩小至 50% 时自动停留 500ms，需再次缩小才可进入 20%~50% 区间。放大越过 50% 重新锁门。

### 5.2 照片拖放

1. 用户点击 InteractionCanvas 上的照片区，进入拖放模式
2. `pointermove` 实时更新照片在 OuterFrame 逻辑空间的坐标
3. 照片不可拖入地图中心区域（60%×80%），完全进入时推到最近边缘外侧
4. `pointerup` 时保存 `(frame_x, frame_y)` 到数据库（防抖 500ms，避免频繁写入）
5. 拖放时 InteractonCanvas 捕获所有 pointer 事件，防止触发 OuterFrame 平移

### 5.3 照片上传入口

- 在 OuterFrame 上提供工具栏（浮动在右上角），包含「添加照片」按钮
- 上传流程沿用现有 `POST /api/storage/upload` 接口
- 上传后照片默认出现在鼠标光标位置或自动排列到外框空白区域
- 上传完成后写入 `frame_x`, `frame_y` 到 `storage_files`

### 5.4 自动排列

「自动排列」按钮将某地点的所有照片在外框上自动排成网格：
- 以该地点 POI 在 OuterFrame 中的坐标为中心
- 照片沿半径方向向外排列（螺旋布局），避免与其他地点照片重叠
- 排列完成后写入各照片的 `frame_x`, `frame_y`

---

## 6. API 层

### 6.1 照片位置

| 方法 | 路径 | 功能 |
|------|------|------|
| PATCH | `/api/storage/photos/{id}/position` | 更新单张照片的外框坐标 |
| POST | `/api/storage/photos/auto-layout` | 触发某地点的自动排列 |

**PATCH `/api/storage/photos/{id}/position`**

```
Request:  { frame_x: number, frame_y: number }
Response: { ok: true }
```

**POST `/api/storage/photos/auto-layout`**

```
Request:  { place_title: string }
Response: { ok: true, positions: [{ id, frame_x, frame_y }, ...] }
```

### 6.2 现有接口修改

**GET `/api/storage/photos`** —— 返回的照片对象增加 `frame_x`, `frame_y` 字段。

---

## 7. 组件拆分

由于当前 `UserFootprintsPage` 为 632 行单文件大组件，本次新增外框功能需要拆分组件：

| 组件 | 职责 |
|------|------|
| `UserFootprintsPage` | 数据加载、状态管理、路由（精简后 < 150 行） |
| `OuterFrame` | 外框容器，管理缩放/平移/手势，渲染调度 |
| `OuterFrameCanvas` | 封装 4 层 Canvas 的渲染逻辑（照片、连线、背景、交互） |
| `FootprintToolbar` | 外框上的浮动工具栏（添加照片、自动排列、缩放控件） |
| `FootprintGroupPanel` | 现有右侧分类面板，保留为浮动侧边栏（可收起） |

---

## 8. 风险与缓解

| 风险 | 严重度 | 缓解措施 |
|------|--------|---------|
| AMap 在 CSS transform 父级中的兼容性 | 高 | 先在原型中测试 AMap 在 `transform: scale()` 父级内的行为。AMap 内部使用绝对定位的 DOM 元素，可能依赖父级无 transform。若出现偏移，尝试 `will-change: transform` 或改用 `zoom` 属性。 |
| Canvas 拖放体验不如 DOM | 中 | 先用 InteractionCanvas 做 hit-test。若体验不佳，关键照片区域可改用 DOM 绝对定位（每地点一个 DOM容器），其余用 Canvas。 |
| 移动端双指缩放冲突 | 中 | AMap 的 touch 事件和 OuterFrame 的 touch 事件需仔细做区域判断，通过 `touches` 数量和触摸起始位置分流。 |
| 数百张照片的数据库写入 | 低 | 拖放结束防抖 500ms 后单次写入，自动排列批量 UPDATE。 |

---

## 9. 实施阶段

| 阶段 | 内容 | 预计工作量 |
|------|------|------------|
| P1: 原型验证 | 测试 AMap 在 CSS scale() 父元素中的行为 | 0.5d |
| P2: 坐标系统 | 实现 OuterFrame 容器 + 坐标变换工具函数 | 1d |
| P3: 照片 Canvas 渲染 | 虚拟化 + LOD 加载 + 拖放 | 2d |
| P4: 连线渲染 | POI→照片区连线 + rAF 更新 | 1d |
| P5: 数据库 + API | 扩展表、位置 CRUD 接口 | 0.5d |
| P6: 组件拆分 | 重构 UserFootprintsPage + 面板浮动化 | 1d |
| P7: 自动排列 | 螺旋布局算法 | 0.5d |
| P8: 移动端适配 | 双指手势、触摸事件分流 | 1d |
| P9: 调试与优化 | 性能调优、边界情况处理 | 1d |

**总计**：约 8.5 个工作日。

---

## 10. 待验证问题

1. **AMap 与 CSS transform 父级的兼容性**（P1 阶段确认，若不可行需换方案）
2. OuterFrame 逻辑空间的总尺寸和边界（是否需要无限空间？）
3. 移动端外框环形区域的有效交互面积是否足够（手指遮挡问题）

---

## 11. 2026-05-15 更新

### 地图标注点多样式
标注点支持颜色和形状配置（存储在 `user_footprint_settings.marker_color` / `marker_shape`）：
- 形状：图钉（`pin`）/ 圆点（`dot`）/ 菱形（`diamond`）
- 颜色：预设 20 色调色板可选，默认 `#ef4444`
- 使用 SVG（图钉）或 CSS 渲染，不依赖外部图标

### POI 地图标签
连线地图端可显示地点名称标签（`show_poi_labels` / `poi_label_color`）：
- 标签位于 POI 点下方偏移处
- 默认黑色 `#000000`，可在设置面板修改颜色
- 显示开关独立于照片和连线

### 右下角设置面板
- LegendPanel 改为「设置」，分「显示开关」和「样式设置」两个手风琴分区
- 足迹和设置面板折叠时滑入右侧，hover 滑出
- 点击面板外空白自动折叠
- 颜色选择器使用全屏遮罩，不受 overflow 裁剪

### 照片拖放地图禁区
照片不可拖入地图中心区域（60%×80%，固定逻辑尺寸，全边框检测）。

### 缩放门控
缩小至 50% 时自动停留 500ms（`SCALE_DETENT = 0.5`），再次缩小可至 20%。放大超过 50% 重新锁门。
