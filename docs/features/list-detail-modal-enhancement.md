# 榜单详情弹窗完善功能

## 概述

完善榜单页面地图标注点的数据组详情弹窗，添加位置、简介、网络图片、评论功能，并将评分与评价整合到点击"已去"后弹出的评分小窗口中。

## 功能列表

### 1. 数据库

新增 `rating_aggregates` 表用于存储评分汇总：
- `target_type` - 目标类型（如 list_item）
- `target_id` - 目标ID
- `average_rating` - 平均评分
- `rating_count` - 评分人数

在 `list_items` 表添加字段：
- `intro` - 简介
- `image_url` - 网络图片URL

### 2. 后端 API

- `GET /api/lists` - 返回完整的项数据（包括 intro, image_url）
- `PUT /api/admin/list_items` - 支持编辑 intro 和 image_url
- `GET /api/ratings?averageOnly=true` - 返回评分汇总（从 rating_aggregates 表）
- `POST /api/ratings` - 评分时自动更新 rating_aggregates 表

### 3. 后台管理

在榜单项编辑表单中添加：
- 位置（address）- 输入框
- 简介（intro）- textarea
- 网络图片URL（image_url）- 输入框带预览

### 4. 前端弹窗

**布局：**
- 弹窗比例 1:1（左侧50%，右侧50%）
- 左侧：图片区域，使用 cover 模式填充
- 右侧：可滚动信息区域

**显示内容：**
- 标题
- 描述
- 位置（显示 address 字段）
- 评分（显示综合得分，精确一位小数，金色数字）
- 简介（显示 intro 字段）
- 网络图片（显示 image_url，点击可查看大图）

**交互：**
- 点击"已去"按钮弹出评分小窗口：
  - 星级评分
  - 评论输入框
  - 取消按钮
  - 确定按钮
- 再次点击"已去"（已记录状态）直接取消，删除对应评分数据

### 5. 榜单页面

**列表项布局：**
- 左侧：封面图片（150x150）
- 中间：标题和描述（靠上对齐）
- 右下角：三个点按钮（横向排列）

**交互：**
- 点击列表项 → 仅放大地图
- 点击三点按钮 → 显示详情弹窗
- 文本区域鼠标保持默认样式

### 6. 后台用户管理

用户详情页"足迹"标签显示：
- 地点标题
- 访问时间
- 评分（如果有）
- 评价（如果有）

## 数据库变更

```sql
-- 新增 rating_aggregates 表
CREATE TABLE IF NOT EXISTS rating_aggregates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  target_type VARCHAR(32) NOT NULL,
  target_id INT NOT NULL,
  average_rating VARCHAR(10) DEFAULT '0',
  rating_count INT DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY rating_aggregates_target_unique (target_type, target_id)
);

-- list_items 表新增字段
ALTER TABLE list_items ADD COLUMN intro TEXT NULL AFTER description;
ALTER TABLE list_items ADD COLUMN image_url TEXT NULL AFTER intro;
```

## 相关文件

- `src/db/schema.ts` - 数据库 Schema
- `src/app/api/lists/route.ts` - 榜单 API
- `src/app/api/ratings/route.ts` - 评分 API
- `src/app/api/admin/list_items/route.ts` - 后台管理榜单项 API
- `src/app/management/lists/[id]/page.tsx` - 后台榜单编辑页
- `src/modules/lists/ListDetailModal/index.tsx` - 详情弹窗组件
- `src/app/(shell)/lists/page.tsx` - 榜单页面
- `src/app/(shell)/lists/lists-page.module.css` - 榜单页面样式
- `src/app/management/users/[id]/page.tsx` - 后台用户详情页