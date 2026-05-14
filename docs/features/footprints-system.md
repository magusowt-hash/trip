# 足迹系统开发文档

## 概述

足迹系统包括三大模块：
1. **足迹分类组** — 类似音乐歌单的地点组织系统
2. **本地存储** — 用户上传照片，5GB/人，存于服务器本地（后续迁云）
3. **AList 网盘（可选）** — 挂载网盘关联云端图片

---

## 一、页面路由

| 路由 | 用途 |
|------|------|
| `/footprints` | 重定向到 `/user/footprints` |
| `/user/footprints` | 主页面：左侧地图 + 右侧分类组 |
| `/albums/[listItemId]` | AList 网盘相册浏览（网格/列表/瀑布流） |

---

## 二、数据库

### 新表

**footprint_groups** — 分类组

| 列 | 类型 | 说明 |
|----|------|------|
| id | serial PK | |
| user_id | int | 用户 |
| name | varchar(64) | 组名 |
| is_default | tinyint | 默认组（每用户一个） |
| sort_order | int | 排序 |
| created_at | timestamp | |
| updated_at | timestamp | |

索引：`(user_id)`, `(user_id, is_default)`

**footprint_group_items** — 组内地点

| 列 | 类型 | 说明 |
|----|------|------|
| id | serial PK | |
| group_id | int | FK → footprint_groups |
| list_item_id | int | FK → list_items |
| cloud_folder | varchar(255) | AList 绑定的文件夹路径 |
| cloud_cover | varchar(500) | AList 封面图 URL |
| added_at | timestamp | |

唯一约束：`(group_id, list_item_id)`

**storage_files** — 用户上传的照片

| 列 | 类型 | 说明 |
|----|------|------|
| id | serial PK | |
| user_id | int | 用户 |
| place_title | varchar(255) | 地点名 |
| filename | varchar(500) | 文件名 |
| size | bigint | 文件大小（字节） |
| created_at | timestamp | |

唯一约束：`(user_id, place_title, filename)`  
索引：`(user_id, place_title)`

**alist_config** — AList 配置（单例全局）

| 列 | 类型 | 说明 |
|----|------|------|
| id | serial PK | 固定为 1 |
| url | varchar(255) | AList 地址 |
| username | varchar(64) | 用户名 |
| password | varchar(128) | 密码 |
| root_path | varchar(255) | 根路径 |
| enabled | tinyint | 是否启用 |
| updated_at | timestamp | |

### 源文件

```
src/db/schema.ts              # 总出口
src/db/schema.footprints.ts   # footprint_groups, footprint_group_items
src/db/schema.storage.ts      # storage_files
src/db/schema.alist.ts        # alist_config
```

---

## 三、API 端点

### 足迹分类组

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/footprints/groups` | 列出用户分类组（首次自动创建默认组） |
| POST | `/api/footprints/groups` | 创建分类组 `{ name }` |
| PATCH | `/api/footprints/groups/[id]` | 更新组名 / 设为默认 |
| DELETE | `/api/footprints/groups/[id]` | 删除组 |
| GET | `/api/footprints/groups/[id]/items` | 组内地点（含标题/地址/经纬度） |
| POST | `/api/footprints/groups/[id]/items` | 添加地点 `{ list_item_id }` |
| DELETE | `/api/footprints/groups/[id]/items?item_id=X` | 移除地点 |

### 默认组（已去操作）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/footprints/default/items` | 加入默认组（幂等）`{ list_item_id }` |
| DELETE | `/api/footprints/default/items?list_item_id=X` | 从默认组移除 |

### 本地存储

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/storage/upload` | multipart 上传 `{ place_title, files[] }` |
| GET | `/api/storage/photos?place_title=X` | 列出某地点的照片 |
| DELETE | `/api/storage/photos?id=X` | 删除照片 |
| GET | `/api/storage/file?uid=X&place=Y&file=Z` | 输出文件（需登录+同用户） |

### AList 网盘（可选）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/alist/folders?name=X` | 按名称搜文件夹 |
| GET | `/api/alist/folders?path=X` | 列出文件夹下图片 |
| POST | `/api/alist/cover` | 自动匹配封面 `{ list_item_id }` |
| POST | `/api/alist/bind` | 手动绑定 `{ list_item_id, folder_path }` |

### 后台管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/PUT/POST | `/api/admin/alist/config` | AList 配置 CRUD / 测试连接 |
| GET | `/api/admin/footprints?type=storage` | 存储总览 |
| GET | `/api/admin/footprints?type=storage_detail&user_id=X` | 用户文件列表 |
| DELETE | `/api/admin/footprints?type=storage_delete&file_id=X` | 删除文件 |

### 源文件

```
src/app/api/footprints/
  _auth.ts                        # JWT 鉴权
  groups/route.ts                 # GET + POST
  groups/[id]/route.ts            # PATCH + DELETE
  groups/[id]/items/route.ts      # GET + POST + DELETE（含 cloud_cover/cloud_folder）
  default/items/route.ts          # POST + DELETE 默认组

src/app/api/storage/
  _auth.ts                        # JWT 鉴权
  upload/route.ts                 # multipart POST
  photos/route.ts                 # GET + DELETE
  file/route.ts                   # 文件输出（需鉴权）

src/app/api/alist/
  _auth.ts                        # JWT 鉴权
  folders/route.ts                # GET
  cover/route.ts                  # POST
  bind/route.ts                   # POST

src/app/api/admin/alist/config/route.ts   # GET/PUT/POST
src/app/api/admin/footprints/route.ts     # GET/DELETE（含 storage 查询）
```

---

## 四、服务模块

### `src/services/storage.ts`

核心方法：

```
getUserUsage(userId)           → 查询用户已用存储量
saveFile(userId, title, name, buffer) → 保存文件，返回 URL
listPhotos(userId, title)      → 列出地点照片
deletePhoto(userId, fileId)    → 删除照片及文件
serveFile(uid, place, file)    → 读取文件（返回 buffer + mime）
```

安全措施：
- 路径遍历防护（`path.resolve` + `startsWith` 校验）
- 单文件最大 20MB
- 仅允许 jpg/png/gif/webp/bmp/svg
- 每用户 5GB 配额

### `src/services/alist.ts`

核心方法：

```
searchFolders(userId, name)    → 按名称搜文件夹
listFiles(userId, path)        → 列图片
getFirstImage(userId, path)    → 取第一张图 URL
testConnection()               → 测试连接
clearCache()                   → 清缓存
```

安全措施：
- 所有路径自动拼接 `/user_{userId}/` 前缀
- `../` 过滤
- Token 缓存 + 过期刷新

---

## 五、前端页面

### `/user/footprints`（主页面）

**布局：** Split grid — 左 70% 地图 + 右 30% 分类组

**地图：** `PlanMap` 组件，根据当前选中分类组内地点标注 markers
- 点击卡片 → 地图聚焦
- 点击标记 → 地图聚焦

**右侧面板：**

1. **分类组 Tab** — 横向滚动，切换分类组
   - 新建：点击「＋新建」输入组名
   - 重命名、设为默认、删除（文字按钮）
   - 默认组带蓝色「默认」标签

2. **地点卡片** — 缩略图 + 标题 + 地址 + 榜单名
   - 封面优先显示 `cloud_cover`（AList），否则用 `coverImage`
   - 复选框（批量选择模式）
   - 三点按钮 → 左侧弹出菜单：
     - 上传照片 → 本地文件选择器 → 上传到服务器
     - 查看照片 → 底部弹窗展示已上传照片网格
     - 网盘相册 → 跳转 `/albums/[id]`
     - 添加到其他组 → 选择目标组弹窗
     - 从本组移除

3. **批量操作：**
   - 点击「选择多个」开启批量模式
   - 全选/取消全选
   - 底部固定栏：已选 N 项 / 全选 / 添加到其他组 / 从本组移除

4. **照片弹窗：** 底部 50vh 区域，网格展示照片 → 上传 / 删除 / 关闭

**源文件：**
```
src/app/(shell)/user/footprints/page.tsx
src/app/(shell)/user/footprints/footprints.module.css
```

### `/albums/[listItemId]`（AList 相册）

顶部栏：返回 + 地点名·相册 + 视图切换（网格 🗔 / 列表 ▦ / 瀑布流 ▤）

三种视图：
- 网格：`grid` 等大缩略图，点击 → 全屏大图
- 列表：缩略图 + 文件名 + 大小
- 瀑布流：不等高列

全屏大图：左右箭头翻页 + 键盘支持 + 计数器

**源文件：**
```
src/app/(shell)/albums/[listItemId]/page.tsx
src/app/(shell)/albums/[listItemId]/album.module.css
```

---

## 六、集成点

### 榜单「已去」联动

`src/app/(shell)/lists/page.tsx` → `handleVisited`：
- 点击已去 → `POST /api/footprints/default/items` 加入默认组
- 取消已去 → `DELETE /api/footprints/default/items` 从默认组移除
- 加入默认组后 → 异步 `POST /api/alist/cover` 尝试匹配云端封面

### 侧栏导航

`src/components/layout/navTabs.ts` → `PRIMARY_NAV_TABS`：
- 新增 `{ href: '/footprints', label: '足迹' }`（重定向到 `/user/footprints`）

`src/components/layout/user-profile-menu.tsx`：
- 已有「我的足迹」→ `/user/footprints`

---

## 七、后台管理

### 存储管理（`/management/footprints`）

- 统计卡片：有上传用户数 / 总存储量 / 总文件数 / 覆盖地点数
- 用户列表：每行显示地点数/文件数/带进度条的存储用量/配额
- 展开查看文件详情：地点 → 文件名 → 大小 → 日期 → 删除

### 用户详情足迹 Tab（`/management/users/[id]`）

- 分类组列表（可展开查看地点）
- 每个地点显示「N 张」照片数（有则显示，无则不显示）
- 展开地点显示照片缩略图网格 + 删除按钮

### AList 配置（`/management/alist`）

- 表单：URL / 用户名 / 密码 / 根路径 / 启用开关
- 「测试连接」按钮

**源文件：**
```
src/app/management/footprints/page.tsx
src/app/management/users/[id]/page.tsx
src/app/management/alist/page.tsx
```

---

## 八、安全要点

| 项 | 措施 |
|----|------|
| 文件服务 | 需登录 + 仅允许访问自己用户目录 |
| 路径遍历 | `sanitize` 过滤特殊字符 + `path.resolve` + `startsWith` 双重校验 |
| 上传限制 | 单文件 20MB，5GB/用户，仅允许图片扩展名 |
| AList 隔离 | 自动注入 `/user_{userId}/` 前缀，过滤 `../` |
| 用户间隔离 | `storage_files` 和 `footprint_groups` 均通过 userId 隔离查询 |

---

## 九、文件索引

```
新建文件：
  src/db/schema.footprints.ts
  src/db/schema.storage.ts
  src/db/schema.alist.ts
  src/services/storage.ts
  src/services/alist.ts
  src/app/api/footprints/_auth.ts
  src/app/api/footprints/groups/route.ts
  src/app/api/footprints/groups/[id]/route.ts
  src/app/api/footprints/groups/[id]/items/route.ts
  src/app/api/footprints/default/items/route.ts
  src/app/api/storage/_auth.ts
  src/app/api/storage/upload/route.ts
  src/app/api/storage/photos/route.ts
  src/app/api/storage/file/route.ts
  src/app/api/alist/_auth.ts
  src/app/api/alist/folders/route.ts
  src/app/api/alist/cover/route.ts
  src/app/api/alist/bind/route.ts
  src/app/api/admin/alist/config/route.ts
  src/app/api/admin/footprints/route.ts
  src/app/(shell)/user/footprints/page.tsx
  src/app/(shell)/user/footprints/footprints.module.css
  src/app/(shell)/albums/[listItemId]/page.tsx
  src/app/(shell)/albums/[listItemId]/album.module.css
  src/app/management/footprints/page.tsx
  src/app/management/alist/page.tsx

修改文件：
  src/db/schema.ts                       # 导出新表
  src/components/layout/navTabs.ts       # 添加足迹导航
  src/app/(shell)/footprints/page.tsx    # → 重定向
  src/app/(shell)/lists/page.tsx         # handleVisited 集成
  src/app/management/layout.tsx          # 添加 alist 菜单
  src/app/management/users/[id]/page.tsx # 足迹 Tab 增强
  src/app/api/user/lists/route.ts        # 移除 visitedPlaces
  src/app/api/admin/users/route.ts       # 移除 visitedPlaces
```
