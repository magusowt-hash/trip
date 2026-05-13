# AList 网盘图片展示设计

## 1. 概述

通过服务端部署 AList 挂载网盘，实现足迹地点关联云端文件夹图片。图片直链从 AList 出，不占用 Trip 服务器带宽。所有访问经 Trip 后端鉴权 + 路径隔离，保障用户间隐私。

## 2. 架构

```
用户浏览器 ←img src→ AList (临时签名 URL)
     ↓ fetch                      ↑
Trip 后端 API ──查询文件夹/图片──→ AList REST API
     ↓ 鉴权 + 路径注入
   userId → /user_{id}/...
```

AList 既存配置通过环境变量注入，不新建 AList 实例。

## 3. 数据层

### 3.1 新增表

**alist_config** — AList 连接配置（单例全局）

| 列 | 类型 | 说明 |
|----|------|------|
| id | serial PK | 固定为 1 |
| url | varchar(255) NOT NULL | AList 服务地址 |
| username | varchar(64) NOT NULL | AList 登录用户名 |
| password | varchar(128) NOT NULL | AList 登录密码 |
| root_path | varchar(255) DEFAULT '/' | 网盘根路径 |
| enabled | tinyint DEFAULT 0 | 是否启用 |
| updated_at | timestamp | |

### 3.2 修改表

**footprint_group_items** 新增列：

| 列 | 类型 | 说明 |
|----|------|------|
| cloud_folder | varchar(255) | 手动绑定的云端文件夹路径（相对 root_path/user_{id}/） |
| cloud_cover | varchar(500) | 云端封面图直链（自动取第一张） |

## 4. API 层

所有 `/api/alist/*` 需要登录态。后端通过 `AListClient` 模块统一对接 AList REST API。

### 4.1 AListClient 服务模块

`src/services/alist.ts`：

```typescript
// 核心方法
class AListClient {
  login(): Promise<string>;           // 获取 token
  listDir(path: string): Promise<File[]>;   // 列出目录
  getFile(path: string): Promise<string>;   // 获取直链
}
```

### 4.2 端点

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/alist/folders?name=故宫` | 按名称模糊匹配当前用户下的文件夹 |
| GET | `/api/alist/folders?path=/故宫` | 列出指定路径下的图片文件 |
| GET | `/api/alist/cover?list_item_id=42` | 获取/刷新某地点的云端封面 |
| POST | `/api/alist/bind` | 手动绑定地点到云端文件夹 `{list_item_id, folder_path}` |
| PUT | `/api/admin/alist/config` | 管理员更新 AList 配置 |

### 4.3 鉴权 + 路径隔离

每个请求处理流程：

```
1. verifyAuthToken(token) → userId
2. 构建安全路径: basePath = rootPath + '/user_' + userId
3. 所有 AList API 调用在 basePath 下操作
4. 用户请求 /api/alist/folders?name=故宫
   → 查询 AList: basePath 下包含"故宫"的文件夹
5. 用户请求路径不可指定绝对路径或 ../
```

### 4.4 请求/响应

**GET /api/alist/folders?name=故宫**

```json
{
  "folders": [
    { "name": "故宫", "path": "/user_1/北京/故宫", "file_count": 12 }
  ]
}
```

**GET /api/alist/folders?path=/北京/故宫&view=thumb**

```json
{
  "files": [
    { "name": "IMG_001.jpg", "url": "https://alist/d/...?sign=xxx", "thumb": "https://alist/d/...?sign=xxx+thumb", "size": 2048000 },
    { "name": "IMG_002.jpg", "url": "https://alist/d/...?sign=yyy", "thumb": "https://alist/d/...?sign=yyy+thumb", "size": 1536000 }
  ]
}
```

## 5. 封面覆盖

### 5.1 触发时机

1. 用户点击榜单「已去」→ 地点加入到默认组时自动触发
2. 用户在分类组中手动刷新封面

### 5.2 逻辑

```
POST /api/alist/cover { list_item_id: 42 }
  → 从 footprint_group_items 获取该地点标题
  → 在用户 basePath 下搜索同名文件夹
  → 获取文件夹下第一张图片直链
  → 写入 footprint_group_items.cloud_cover
  → 若已有 cloud_cover 且仍有效则跳过
```

前端展示：若 `item.cloud_cover` 有值，卡片封面优先显示该 URL，否则显示原有 `coverImage`。

## 6. 相册视图

### 6.1 触发入口

足迹地点卡片右侧「⋯」菜单新增「相册」项，或卡片上独立的相册图标按钮。

### 6.2 页面：`/albums/[listItemId]`

布局：

```
┌─────────────────────────────────────┐
│ ← 返回    故宫 · 相册    [🗔 ▦ ▤]   │  ← 顶部栏 + 视图切换
├─────────────────────────────────────┤
│                                     │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐     │
│  │图片│ │图片│ │图片│ │图片│     │  ← 网格视图
│  │  1 │ │  2 │ │  3 │ │  4 │     │
│  └────┘ └────┘ └────┘ └────┘     │
│  ┌────┐ ┌────┐                     │
│  │  5 │ │  6 │                     │
│  └────┘ └────┘                     │
│                                     │
└─────────────────────────────────────┘
```

### 6.3 三种视图

| 视图 | 说明 |
|------|------|
| 🗔 网格 | 等大缩略图网格排列，3-4 列，点击进入大图 |
| ▦ 列表 | 缩略图 + 文件名 + 大小 + 日期，单列滚动 |
| ▤ 瀑布流 | 不等高列，适合预览宽高比不一的照片 |

点击任意图片 → 全屏大图（左右箭头翻页，支持键盘）。

### 6.4 数据流

```
/albums/[listItemId]
  → GET /api/alist/folders?path={cloud_folder}
  → 返回图片列表（含 thumb + 原图 URL）
  → 前端根据当前视图渲染
  → 图片直接从 AList 直链加载（不经过 Trip 服务器）
```

### 6.5 文件路径

- `src/app/(shell)/albums/[listItemId]/page.tsx` — 相册页面
- `src/app/(shell)/albums/[listItemId]/album.module.css` — 样式

## 7. 后台管理

`src/app/management/alist/page.tsx`：

- AList 连接配置表单（URL, 用户名, 密码, 根路径）
- 「测试连接」按钮验证配置
- 「启用/禁用」开关

侧栏新增菜单：
```typescript
{ path: '/management/alist', icon: '☁️', label: '网盘配置' }
```

## 8. 前端集成点

### 8.1 足迹卡片变更

`src/app/(shell)/user/footprints/page.tsx`：

- 封面优先显示 `cloud_cover`，为空则用 `coverImage`
- 在 `⋯` 菜单中新增「相册」→ 跳转 `/albums/{listItemId}`
- 若地点已绑定 `cloud_folder`，可直接显示相册入口

### 8.2 已去流程变更

`src/app/(shell)/lists/page.tsx` handleVisited：

- 在 `POST /api/footprints/default/items` 成功后
- 额外调用 `POST /api/alist/cover { list_item_id }` 尝试获取封面

## 9. 文件清单

| 文件 | 说明 |
|------|------|
| `src/services/alist.ts` | AListClient 服务模块 |
| `src/db/schema.alist.ts` | alist_config 表 + footprint_group_items 新增列 |
| `src/app/api/alist/folders/route.ts` | 文件夹查询/列表 API |
| `src/app/api/alist/cover/route.ts` | 封面刷新 API |
| `src/app/api/alist/bind/route.ts` | 手动绑定 API |
| `src/app/api/admin/alist/config/route.ts` | 管理员配置 API |
| `src/app/(shell)/albums/[listItemId]/page.tsx` | 相册页面 |
| `src/app/(shell)/albums/[listItemId]/album.module.css` | 相册样式 |
| `src/app/management/alist/page.tsx` | 管理后台配置页 |
| 修改 | `src/db/schema.ts`, `src/db/schema.footprints.ts`, 足迹页面, 榜单页面, 管理侧栏 |

## 10. 约束

- **不存储图片到 Trip 服务器**，仅存 `cloud_cover` URL 和 `cloud_folder` 路径
- 图片 URL 依赖 AList 签名时效，前端需处理过期重取
- 若 AList 未启用，所有云端图片功能静默降级（卡片显示原有封面，相册按钮不显示）
- 相册视图为纯客户端组件，无 SSR
