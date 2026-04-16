# 计划时间选择功能设计

## 概述

为「制定计划」模块添加时间选择功能：在大交通Tab的首尾选择整体时间段，在每条交通选择上再做时间段选择，最终在「我的计划」列表中正确显示。

## UI/UX 设计

### 1. 大交通Tab - 整体时间段选择

在「大交通」Tab 内容区域顶部添加时间段选择器：

```
┌─────────────────────────────────────────────┐
│  起点 ──→ 备注 ──→ 终点                      │
│  起点 ──→ 备注 ──→ 终点                      │
│  起点 ──→ 备注 ──→ 终点                      │
├─────────────────────────────────────────────┤
│  开始日期 ─────────────── 结束日期           │
│  [04-20]              [04-25]                │
└─────────────────────────────────────────────┘
```

- **位置**：交通列表下方，tab 内容区域底部
- **交互**：点击日期区域弹出 Day.js UI 日历弹窗
- **样式**：白色圆角卡片，带阴影，与现有 white clay 风格一致
- **默认值**：空，用户手动选择

### 2. 每条交通项 - 独立时间段

每条交通项添加时间段显示区域：

```
[起点] → [备注气泡] → [终点]     04-20 → 04-22
```

- **显示格式**：开始日期 → 结束日期（如 "04-20 → 04-22"）
- **交互**：点击日期区域弹出日历选择
- **位置**：交通项右侧，与地点信息对齐

### 3. 我的计划列表

保持现有的按年月分组结构，显示用户保存的计划及其时间段：

```
2026年4月
  ├── trip-1 (04-20 → 04-25)
  └── trip-2 (05-01 → 05-05)

2026年5月
  └── trip-3 (06-19 → 06-21)
```

- **单列表页面**：保持按年月分组，与现有代码一致
- **时间段显示**：从数据库读取，显示在计划名称后
- **样式**：使用现有的 `.dateLine` 样式类

## 数据模型

### 数据库表更新

```sql
-- plans 表添加字段
ALTER TABLE plans ADD COLUMN start_date DATE;
ALTER TABLE plans ADD COLUMN end_date DATE;

-- transport_items 表添加字段
ALTER TABLE transport_items ADD COLUMN start_date DATE;
ALTER TABLE transport_items ADD COLUMN end_date DATE;
```

### Drizzle Schema 更新

```typescript
// plans 表
startDate: date('start_date'),
endDate: date('end_date'),

// transport_items 表
startDate: date('start_date'),
endDate: date('end_date'),
```

## API 设计

### GET /api/plans

返回用户所有计划，包含时间段：

```json
{
  "plans": [
    { "id": 1, "name": "trip-1", "start_date": "2026-04-20", "end_date": "2026-04-25" },
    { "id": 2, "name": "trip-2", "start_date": "2026-05-01", "end_date": "2026-05-05" }
  ]
}
```

### GET /api/plans/[id]

返回计划详情，包含交通项及其时间段：

```json
{
  "id": 1,
  "name": "trip-1",
  "start_date": "2026-04-20",
  "end_date": "2026-04-25",
  "items": [
    { "from": "北京", "to": "上海", "start_date": "2026-04-20", "end_date": "2026-04-20", "note": "高铁" },
    { "from": "上海", "to": "杭州", "start_date": "2026-04-22", "end_date": "2026-04-22", "note": "" }
  ]
}
```

### POST /api/plans

保存新计划时包含时间段：

```json
{
  "name": "trip-1",
  "start_date": "2026-04-20",
  "end_date": "2026-04-25",
  "items": [
    { "from": "北京", "to": "上海", "start_date": "2026-04-20", "end_date": "2026-04-20", "note": "高铁" }
  ]
}
```

### PUT /api/plans

更新计划时包含时间段，同 POST 格式。

## 组件设计

### DateRangePicker 组件

- 接收 `startDate` 和 `endDate` 作为 value
- 内部使用 Day.js UI 的 DatePicker
- 输出格式：YYYY-MM-DD 字符串

### TransportItem 组件扩展

在现有交通项基础上添加：
- 日期显示区域
- 日期编辑弹窗触发器

### 时间段显示样式

使用现有 `.dateLine` 样式：
```css
.dateLine {
  font-size: 12px;
  font-weight: 500;
  color: #8a7f74;
  line-height: 1.35;
}
```

## 实施步骤

1. **数据库**：执行 ALTER TABLE 添加新字段
2. **Schema**：更新 Drizzle schema 定义
3. **API**：更新 GET/POST/PUT 路由处理时间段
4. **前端组件**：添加日期选择器组件
5. **页面集成**：在大交通Tab添加整体时间段选择，在每条交通项添加单项时间段
6. **列表更新**：从 API 获取时间段并显示

## 兼容性说明

- 现有 demo 数据（planData.ts）保持不变
- 用户创建的计划使用新的时间段字段
- 无时间段的历史数据显示为空，不影响现有功能