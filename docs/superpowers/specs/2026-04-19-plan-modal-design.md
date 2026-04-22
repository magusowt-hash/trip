# 制定计划弹窗开发文档

> 最后更新: 2026-04-19

## 概述

制定计划弹窗（PlanModal）是 Trip 应用中创建和编辑旅行计划的核心功能模块。采用分 Tab 设计，支持大交通、详细行程、行李清单、预算账单、攻略等功能。

## 技术栈

- **框架**: Next.js 14 (App Router)
- **样式**: CSS Modules
- **状态管理**: React useState/useEffect

## 文件结构

```
src/app/(shell)/plan/
├── page.tsx              # 计划页面主组件
├── plan-page.module.css  # 样式文件
└── planData.ts          # 静态演示数据
```

## 界面结构

### 1. 整体布局

```
┌─────────────────────────────────────────┐
│  计划名称        开始日期 → 结束日期      │  ← modalRegion1 (顶部)
├─────────────────────────────────────────┤
│  [大交通] [详细行程] [行李] [预算] [攻略] │  ← modalRegion21 (Tab栏)
│  [导入计划] [保存计划]                   │  ← 操作按钮
├─────────────────────────────────────────┤
│                                         │  ← modalRegion22 (内容区)
│         Tab 内容渲染区域                 │
│                                         │
└─────────────────────────────────────────┘
```

### 2. 大交通 Tab

采用交通链式 UI：

```
┌─────────────────────────────────────┐
│ 北京 ──[备注]── 上海 │ 4/20 → 4/22 │
│                 │ [+][-] │
├─────────────────────────────────────┤
│ 上海 ──[备注]── 东京 │ 4/23 → 4/25 │
│                 │ [+][-] │
├─────────────────────────────────────┤
│ ...                              │
└─────────────────────────────────────┘
```

**数据结构**:
```typescript
interface TransportItem {
  id: number;
  from: string;       // 起点
  to: string;        // 终点
  note: string;      // 备注
  noteExpanded?: boolean;
  startDate?: string;
  endDate?: string;
}
```

**功能**:
- 点击编辑/删除交通项
- 自动继承上一条的终点作为下一条的起点
- 支持日期范围选择

### 3. 详细行程 Tab

采用左右分栏结构，左侧滑动列表，右侧固定便签：

**左侧列表项**:
```
┌──────────────────┐
│ ● 任务标题        │  ← 点击选择
│ 时间             │
│ [删除] [添加]    │
└──────────────────┘
```

**右侧详情**:
```
┌────────────────────────────┐
│ 任务标题                  │
│ ──────────────────────────│
│ 便签内容输入区域          │
│ (全区域 textarea)        │
│                          │
│                          │
└────────────────────────────┘
```

**数据结构**:
```typescript
interface ItineraryItem {
  id: number;
  title: string;           // 自定义文本1（任务标题）
  time: string;           // 自定义文本2（时间）
  note: string;         // 便签内容
  importance: 'red' | 'yellow' | 'green';  // 重要程度
  expanded?: boolean;   // 是否展开显示右侧
}
```

**功能**:
- 点击圆点切换颜色（红→黄→绿）
- 左侧点击展开对应右侧详情
- 每次只展开一个
- 全区域文本输入

## 数据库表

### plans 表

```sql
CREATE TABLE plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(255),
  start_date DATE,
  end_date DATE,
  active_tab INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'normal',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### transport_items 表

```sql
CREATE TABLE transport_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plan_id INT NOT NULL,
  from_city VARCHAR(255),
  to_city VARCHAR(255),
  note TEXT,
  note_expanded TINYINT DEFAULT 0,
  sort_order INT DEFAULT 0,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX plan_id_idx (plan_id)
);
```

## API 接口

### GET /api/plans

获取用户计划列表

### POST /api/plans

创建新计划

### PUT /api/plans

更新计划

### GET /api/plans/[id]

获取计划详情（包含交通项）

## 样式规范

### 颜色

```css
--color-primary: #2563eb;      /* 蓝色主色 */
--color-danger: #ef4444;       /* 红色 - 重要 */
--color-warning: #eab308;      /* 黄色 - 次要 */
--color-success: #22c55e;     /* 绿色 - 正常 */
```

### 布局

- modalRegion1: 计划信息头部
- modalRegion21: Tab 栏和操作按钮
- modalRegion22: 内容区

## 更新日志

### 2026-04-19

- 详细行程 Tab 重构为左右分栏布局
- 左侧滑动列表，右侧全区域便签输入
- 支持点击切换颜色（红/黄/绿）
- 每次只展开一个详情

### 2026-04-16

- 添加时间选择功能
- 大交通 Tab 支持日期范围
- 计划列表显示时间段