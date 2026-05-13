# 足迹分类组功能设计

## 1. 概述

为足迹（Footprints）页面添加分类组功能，类似音乐软件的歌单模型。用户可创建多个分类组来组织已去地点，支持设为默认组、组间添加/移动地点。

默认分类组替代现有的 `users.visited_places` JSON 扁平列表，点击"已去"时自动归入默认组。

## 2. 数据层

### 2.1 新表

**footprint_groups** — 分类组

| 列名 | 类型 | 说明 |
|------|------|------|
| id | serial PK | |
| user_id | int NOT NULL | FK -> users.id |
| name | varchar(64) NOT NULL | 分类组名 |
| is_default | tinyint DEFAULT 0 | 是否默认组（每用户最多一个） |
| sort_order | int DEFAULT 0 | 排序 |
| created_at | timestamp NOT NULL DEFAULT now() | |
| updated_at | timestamp NOT NULL DEFAULT now() | |

索引：`(user_id)`, `(user_id, is_default)`

**footprint_group_items** — 分类组-地点关联

| 列名 | 类型 | 说明 |
|------|------|------|
| id | serial PK | |
| group_id | int NOT NULL | FK -> footprint_groups.id, ON DELETE CASCADE |
| list_item_id | int NOT NULL | FK -> list_items.id |
| added_at | timestamp NOT NULL DEFAULT now() | |

唯一约束：`(group_id, list_item_id)`

### 2.2 与现有数据的关系

- 分类组系统**替代** `users.visited_places` JSON 字段的作用
- `users.visited_places` 列保留不动（schema 不变），但前端「已去」流程改为写入 `footprint_group_items`
- 已有 `users.visited_places` 数据不自动迁移，用户初次使用时自动创建默认组
- `users.favorite_lists`（收藏）保持不变，独立运作

### 2.3 首次使用初始化

当用户首次访问足迹页或首次点击"已去"时：
1. 查询用户是否已有 `footprint_groups`
2. 若无，自动创建默认组（name="我的足迹"，is_default=1）

## 3. API 层

所有接口需要登录态（cookie `trip_auth`），通过 `verifyAuthToken` 鉴权。

### 3.1 分类组

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/footprints/groups` | 获取当前用户所有分类组 |
| POST | `/api/footprints/groups` | 创建分类组 |
| PATCH | `/api/footprints/groups/[id]` | 更新组名/设为默认 |
| DELETE | `/api/footprints/groups/[id]` | 删除分类组（级联删除关联项） |

**GET /api/footprints/groups** 响应：
```json
{
  "groups": [
    { "id": 1, "name": "我的足迹", "is_default": 1, "sort_order": 0, "item_count": 5 },
    { "id": 2, "name": "国内必去", "is_default": 0, "sort_order": 1, "item_count": 3 }
  ]
}
```

**POST /api/footprints/groups** 请求：`{ "name": "国内必去" }`  
响应：`{ "group": { "id": 2, "name": "国内必去", ... } }`

**PATCH /api/footprints/groups/[id]** 请求：`{ "name": "新名称" }` 或 `{ "is_default": true }`  
设为默认时，自动取消其他组的 is_default。

**DELETE /api/footprints/groups/[id]**：级联删除 `footprint_group_items`。

### 3.2 组内地点

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/footprints/groups/[id]/items` | 获取组内地点（含 list_item 详情） |
| POST | `/api/footprints/groups/[id]/items` | 添加地点到组 |
| DELETE | `/api/footprints/groups/[id]/items/[itemId]` | 从组移除地点 |

**GET /api/footprints/groups/[id]/items** 响应：
```json
{
  "items": [
    {
      "id": 1,
      "list_item_id": 42,
      "title": "故宫",
      "cover_image": "/uploads/xxx.jpg",
      "description": "...",
      "lng": "116.397",
      "lat": "39.908",
      "address": "北京市东城区",
      "list_id": 1,
      "list_name": "北京必去",
      "added_at": "2026-05-13T..."
    }
  ]
}
```

**POST /api/footprints/groups/[id]/items** 请求：`{ "list_item_id": 42 }`  
重复添加返回 409。

### 3.3 「已去」专用端点

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/footprints/default/items` | 将地点加入默认组（无默认组则自动创建） |

请求：`{ "list_item_id": 42 }`

此端点内部逻辑：
1. 查找用户默认组（无则自动创建 name="我的足迹" 的默认组）
2. 将 `listItemId` 添加至 `footprint_group_items`（幂等，已存在则忽略）
3. 同时写入 `users.visited_places` JSON 列保持兼容
4. 返回 `{ "success": true, "group_id": 1 }`

### 3.4 「已去」取消

DELETE `/api/footprints/default/items?list_item_id=42` — 从默认组移除，同时清理 `users.visited_places`

## 4. 前端

### 4.1 足迹页面 `/footprints`（`src/app/(shell)/footprints/page.tsx`）

已有结构：左地图 + 右面板（split grid）。

**右侧面板新增内容：**

```
┌─────────────────────────┐
│ [我的足迹▾] [国内必去] [2024计划] [+新建] │  ← 分类组横向滚动
├─────────────────────────┤
│ 组名: 我的足迹  ⭐设为默认  🗑删除 │
│ 共 5 个地点                         │
├─────────────────────────┤
│ ┌──────┬────────────────────┬───┐  │
│ │ 缩略 │ 故宫                 │ ⋮ │  │  ← 地点卡片
│ │ 图   │ 北京市东城区          │   │  │     右侧⋯菜单
│ └──────┴────────────────────┴───┘  │
│ ┌──────┬────────────────────┬───┐  │
│ │ 缩略 │ 天坛                 │ ⋮ │  │
│ │ 图   │ 北京市东城区          │   │  │
│ └──────┴────────────────────┴───┘  │
│ ...                                 │
└─────────────────────────┘
```

**交互行为：**
- **分类组 Tab 切换**：点击切换选中组，下方展示该组地点列表
- **新建组**：点击"+ 新建"弹出输入框，输入组名创建
- **设为默认**：点击⭐将当前组设为默认，自动取消其他默认
- **删除组**：确认后删除组及其所有地点关联
- **地点卡片点击**：地图聚焦到该地点位置
- **⋯菜单**（地点右侧三点）：弹出「添加到其他组」「从本组移除」操作
  - 「添加到其他组」：弹出组选择列表，选中后添加（同地点可存在于多组）
  - 「从本组移除」：确认后移除关联
- **地图标注**：当前选中组内有经纬度的地点显示为地图 markers

### 4.2 排行榜「已去」流程修改

`src/app/(shell)/lists/page.tsx`:
- `handleVisited` 中，除了现有 `PATCH /api/user/lists` 调用外
- 新增：`POST /api/footprints/default/items` 将地点加入默认组
- 取消已去：`DELETE /api/footprints/default/items?list_item_id=X`
- API 层自动处理默认组创建/幂等

### 4.3 用户侧栏

`src/components/layout/user-profile-menu.tsx` 中已存在「我的足迹」链接指向 `/user/footprints`，保持不变。

## 5. 后台管理

### 5.1 侧栏

`src/app/management/layout.tsx` navItems 新增：
```typescript
{ href: '/management/footprints', icon: '👣', label: '足迹分组' }
```

### 5.2 页面 `/management/footprints/page.tsx`

基础 CRUD 管理页：
- **分类组列表**：表格展示所有用户的分类组（id, 用户名, 组名, 是否默认, 地点数, 创建时间）
- **查看组内地点**：点击展开，显示地点列表（标题、所属榜单、添加时间）
- **删除**：管理员可删除任意分类组
- **从组移除地点**：管理员可移除组内单个地点

## 6. 文件清单

### 新建文件

| 文件 | 说明 |
|------|------|
| `src/db/schema.footprints.ts` | Drizzle schema：footprint_groups, footprint_group_items |
| `src/app/api/footprints/groups/route.ts` | GET（列表）+ POST（创建） |
| `src/app/api/footprints/groups/[id]/route.ts` | PATCH + DELETE |
| `src/app/api/footprints/groups/[id]/items/route.ts` | GET（组内地点）+ POST（添加） |
| `src/app/api/footprints/groups/[id]/items/[itemId]/route.ts` | DELETE（移除） |
| `src/app/api/footprints/default/items/route.ts` | POST（已去加入默认组） + DELETE（已去取消） |
| `src/app/management/footprints/page.tsx` | 后台管理页 |

### 修改文件

| 文件 | 说明 |
|------|------|
| `src/db/schema.ts` | 导出新表 |
| `src/app/(shell)/footprints/page.tsx` | 右侧面板填充分类组 UI |
| `src/app/(shell)/footprints/footprints-page.module.css` | 右侧面板样式 |
| `src/app/(shell)/lists/page.tsx` | handleVisited 集成默认组 |
| `src/app/management/layout.tsx` | 新增侧栏菜单项 |
| `src/app/api/user/lists/route.ts` | visitedPlaces 写入同步 |
| `src/middleware.ts` | 如需保护新 API 路由 |

## 7. 约束与边界

- 不修改 `users` 表结构
- 不迁移已有 `visited_places` 数据
- `favorite_lists` 收藏功能完全独立
- 分类组仅对列表地点（list_items）有效，不涉及帖子等其他实体
- 每个用户最多 20 个分类组
