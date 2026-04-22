# 收藏功能设计

## 概述
实现用户收藏帖子功能，支持 toggle 收藏状态，用户个人页面查看收藏列表，管理后台查看收藏统计。

## 数据库

### 已有结构
- `favorites` 表: `id, post_id, user_id, created_at`
- `favorites` 唯一索引: `(post_id, user_id)` 防止重复收藏
- `posts.favorites_cnt` 计数器

## API 端点

### 1. POST /api/posts/[id]/favorite
- 功能: 切换收藏状态
- 认证: HTTP-only cookie
- 请求: 无 body
- 响应成功: `{ favorited: boolean, favoritesCnt: number }`
- 响应错误: `{ error: string }`

### 2. GET /api/favorites
- 功能: 获取当前用户收藏列表
- 认证: HTTP-only cookie
- 查询参数: `cursor`, `limit`
- 响应: `{ favorites: [...], nextCursor, hasMore }`

### 3. GET /api/admin/favorites
- 功能: 管理后台收藏列表
- 认证: admin cookie
- 查询参数: `page`, `pageSize`
- 响应: `{ favorites: [...], total }`

## 前端

### 1. PostDetailModal
- 收藏按钮显示 ❤️/🤍 + 数量
- 点击 toggle 收藏状态
- 乐观更新 UI

### 2. 用户个人页面
- 新增「收藏」Tab
- 显示收藏的帖子列表

### 3. 管理后台
- 显示收藏统计
- 列出用户收藏记录

## 实现步骤

1. 创建 POST /api/posts/[id]/favorite API
2. 更新 PostDetailModal 收藏按钮
3. 创建 GET /api/favorites API
4. 用户收藏列表页面
5. 创建 GET /api/admin/favorites API
6. 管理后台收藏列表