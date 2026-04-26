# 榜单详情弹窗与用户个人记录设计

## 概述

在用户账户中增加榜单个人记录功能，榜单页面点击列表项弹出详情弹窗，弹窗左图右信息布局。

## 功能列表

### 1. 数据库 - 用户榜单记录字段

在 `users` 表增加 JSON 字段用于存储：
- `favorite_lists` - 用户收藏的榜单列表
- `visited_places` - 用户已去的地点记录  
- `ratings` - 用户对地点的评分

### 2. 榜单项数据扩展

在 `list_items` 表增加字段：
- `intro` (text) - 简介
- `imageUrl` (text) - 网络图片URL

### 3. 榜单详情弹窗

弹窗布局：
- 左侧：图片
- 右侧：可滚动信息区域，从上到下依次：
  1. 标题
  2. 描述
  3. 位置（显示 address 字段）
  4. 评分
  5. 收藏按钮 + 已去按钮
  6. 简介（显示 intro 字段）
  7. 网络图片（显示 imageUrl，点击可查看大图）
  8. 评价（用户评论 textarea）

### 4. 评分与评论弹窗

点击"已去"按钮时弹出小窗口：
- 星级评分（可点击）
- 评论输入框（textarea）
- 取消按钮
- 确定按钮

### 5. 后端 API

- 获取/更新用户收藏榜单
- 获取/更新用户已去记录
- 获取/更新用户评分
- GET /api/lists 返回完整项数据（包括 intro, imageUrl）
- PUT /api/admin/list_items 支持编辑 intro 和 imageUrl

### 6. 后台管理

在榜单项编辑表单中添加：
- 简介（textarea）
- 网络图片URL（input）

## 实施任务

### Task 1: 数据库 Schema 更新

文件：`src/db/schema.ts`
- 在 `list_items` 表增加 intro 和 imageUrl 字段

### Task 2: 更新后端 API

文件：`src/app/api/lists/route.ts`
- GET 返回 intro 和 imageUrl 字段

文件：`src/app/api/admin/list_items/route.ts`
- PUT 支持更新 intro 和 imageUrl

### Task 3: 更新后台管理

文件：`src/app/management/lists/[id]/page.tsx`
- 榜单项编辑表单添加 intro 和 imageUrl 字段

### Task 4: 更新榜单详情弹窗组件

文件：`src/modules/lists/ListDetailModal/index.tsx`
- 显示实际的 intro、imageUrl 数据
- 网络图片点击可查看大图
- 添加评分与评论弹窗（点击已去按钮时触发）

### Task 5: 更新榜单页面

文件：`src/app/(shell)/lists/page.tsx`
- 传递完整的 item 数据到弹窗组件