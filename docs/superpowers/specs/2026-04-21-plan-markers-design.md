# 计划页标记点功能设计

## 概述

在计划页地图上显示标记点（POI），支持后台管理、批量导入、地理编码、地图展示、点击联动等功能。

## 需求

1. 后台管理：增删改查标记点
2. 导入：支持批量 Excel/CSV 导入
3. 地理编码：输入地址自动获取坐标（调用高德 API）
4. 地图显示：一次性加载所有标记点显示在地图上
5. 点击联动：弹窗详情 + 跳转详情页

## 表结构

### markers 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键，自增 |
| name | VARCHAR(255) | 名称 |
| lng | DECIMAL(10,7) | 经度 |
| lat | DECIMAL(10,7) | 纬度 |
| address | VARCHAR(500) | 地址 |
| description | TEXT | 描述 |
| type | ENUM('spot','hotel','restaurant','other') | 类型 |
| status | TINYINT | 状态：0禁用，1启用 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

## 功能设计

### 1. 后台管理

**API 设计**：

- `GET /api/admin/markers` - 列表（支持分页、搜索）
- `GET /api/admin/markers/:id` - 详情
- `POST /api/admin/markers` - 创建
- `PUT /api/admin/markers/:id` - 更新
- `DELETE /api/admin/markers/:id` - 删除
- `POST /api/admin/markers/import` - 批量导入
- `POST /api/admin/markers/geocode` - 地理编码

### 2. 地理编码

调用高德地理编码 API：

- 输入地址 → 获取经纬度
- 自动填充 lng、lat 字段
- 支持批量处理

### 3. 前端地图显示

**PlanMap 组件增强**：

```typescript
interface PlanMapProps {
  markers?: MapMarker[];
  onMarkerClick?: (marker: MapMarker) => void;
}

interface MapMarker {
  id: number;
  position: [number, number];
  title: string;
  type?: string;
  description?: string;
}
```

**加载逻辑**：

1. 页面加载时请求 `/api/markers?status=1`
2. 地图聚合显示所有标记点（根据数量自动调整聚合级别）
3. 点击标记点 → 显示详情弹窗或跳转到详情页

### 4. 点击联动

- 默认显示详情弹窗
- 弹窗包含：名称、地址、描述
- 提供"查看详情"按钮跳转到标记点详情页

## 实现步骤

1. 创建 markers 表（ drizzle schema + migration）
2. 实现后台管理 API（CRUD + import + geocode）
3. 新增批量导入功能（解析 Excel/CSV）
4. 前端标记点加载和显示
5. 点击弹窗和跳转逻辑