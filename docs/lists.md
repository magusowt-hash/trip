# 榜单功能开发文档

## 功能概述

榜单（Lists）是一个展示推荐地点/美食/景点等的模块，包含地图展示、数据列表、后台管理等功能。

## 数据库结构

### lists 表（榜单）
```sql
CREATE TABLE lists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,          -- 榜单名称
  cover_image TEXT,                     -- 封面图片URL
  description TEXT,                   -- 描述
  lng VARCHAR(20),                    -- 经度
  lat VARCHAR(20),                    -- 纬度
  status TINYINT DEFAULT 1,          -- 状态
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
);
```

### list_items 表（榜单项）
```sql
CREATE TABLE list_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  list_id INT NOT NULL,               -- 关联榜单ID
  title VARCHAR(255) NOT NULL,        -- 标题
  cover_image TEXT,                    -- 封面图片URL
  description TEXT,                 -- 描述
  lng VARCHAR(20),                  -- 经度
  lat VARCHAR(20),                  -- 纬度
  address VARCHAR(500),             -- 地址
  order_num INT DEFAULT 0,           -- 排序号（后台可见）
  status TINYINT DEFAULT 1,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
);
```

## API 接口

### 公开接口

#### GET /api/lists
获取榜单列表及数据。

**参数**：
- `list_id` (可选) - 获取指定榜单的数据项

**响应**：
```json
{
  "lists": [
    {
      "id": 1,
      "name": "热门景点",
      "cover_image": "/uploads/xxx.jpg",
      "lng": "116.397",
      "lat": "39.916"
    }
  ],
  "items": [
    {
      "id": 1,
      "list_id": 1,
      "title": "故宫博物院",
      "cover_image": "https://...",
      "description": "描述内容",
      "lng": "116.397",
      "lat": "39.916",
      "order_num": 1
    }
  ]
}
```

### 管理接口

#### GET /api/admin/lists
获取榜单列表（管理）。

#### POST /api/admin/lists
创建榜单。

#### PUT /api/admin/lists?id={id}
更新榜单信息。

#### GET /api/admin/list_items?list_id={id}
获取榜单数据项。

#### POST /api/admin/list_items
添加数据项。

#### PUT /api/admin/list_items?id={id}
更新数据项。

#### DELETE /api/admin/list_items?id={id}
删除数据项。

#### POST /api/admin/list_items/import/csv
CSV批量导入。

## 页面结构

### 前端 /lists
- 左侧：地图（高德地图），显示有坐标的标注点
- 右侧：
  - 榜单Tab（横向滚动，显示封面图+标题）
  - 封面图片轮播（16:9比例）
  - 数据列表（封面+标题+描述）

### 后台管理 /management/lists
- 榜单列表卡片
- 创建新榜单

### 后台管理 /management/lists/[id]
- 榜单信息：封面上传、名称编辑
- 数据管理：
  - 复选框批量选择
  - 序号显示（蓝色圆圈）
  - 行内编辑
  - CSV批量导入
  - 单个/批量删除

## 图片裁切

### 上传流程
1. 选择图片 → 弹出裁切预览框
2. 滚轮缩放、拖动移动
3. 点击"裁切并上传" → 16:9比例压缩保存

### 裁切参数
- 输出尺寸：1280×720 (16:9)
- 格式：JPEG
- 质量：0.9

## CSV导入格式

```
标题,描述,坐标,地址
故宫博物院,描述内容,116.397058,39.916520,北京市东城区
长城,描述内容,116.017000,40.431507,北京市延庆区
```

**说明**：
- 坐标格式：经度,纬度
- 序号自动分配（从现有最大+1开始）
- 支持中文表头

## 文件目录

```
src/
├── app/
│   ├── (shell)/lists/
│   │   ├── page.tsx              # 前端榜单页
│   │   └── lists-page.module.css   # 样式
│   ├── management/
│   │   ├── lists/
│   │   │   ├── page.tsx          # 后台榜单列表
│   │   │   └── [id]/
│   │   │       ├── page.tsx      # 榜单详情管理
│   │   │       └── import/
│   │   │           ├── page.tsx  # JSON导入页
│   │   │           └── CsvImport.tsx  # CSV导入组件
│   │   └── layout.tsx            # 后台布局
│   └── api/
│       ├── lists/route.ts        # 公开榜单API
│       └── admin/
│           ├── lists/route.ts   # 管理榜单API
│           └── list_items/
│               ├── route.ts    # 管理数据项API
│               └── import/
│                   └── csv/route.ts  # CSV导入API
└── components/
    └── PlanMap.tsx             # 地图组件
```

## 字段映射

| 前端字段 | 数据库字段 |
|---------|-----------|
| cover_image | coverImage |
| list_id | listId |
| order_num | orderNum |

## 状态说明

- `status = 1`：正常显示
- `status = 0`：已删除/隐藏

## 注意事项

1. 图片字段名转换：前端`cover_image` ↔ 数据库`coverImage`
2. 上传需要Bearer认证
3. 批量删除需确认
4. CSV导入自动分配序号