# Trip 管理后台系统开发文档

## 概述

Trip 管理后台系统是一个用于管理 Trip 应用数据的后台管理系统，包含数据看板、用户管理、内容管理、密钥管理等功能。

## 技术栈

- **前端框架**: Next.js 14 (App Router)
- **数据库**: MySQL + Drizzle ORM
- **样式**: CSS Modules
- **认证**: 独立密钥体系 (母密钥 + 子密钥)

## 目录结构

```
src/app/
├── management/                    # 管理后台根目录
│   ├── login/                 # 登录页
│   ├── users/                # 用户管理
│   ├── posts/                # 帖子管理
│   ├── comments/             # 评论管理
│   ├── favorites/           # 收藏管理
│   ├── friends/             # 好友关系
│   ├── plans/               # 旅行计划
│   ├── keys/                # 密钥管理
│   ├── layout.tsx           # 管理布局
│   ├── page.tsx             # 首页看板
│   ├── components.tsx        # 公共组件 (useStats, Dashboard)
│   ├── AdminTable.tsx        # 公共表格组件
│   ├── auth-context.tsx      # 认证上下文
│   └── management.module.css # 样式文件
│
└── api/admin/               # 管理 API
    ├── auth/
    │   ├── login/           # 登录验证
    │   └── verify/          # Token 验证
    ├── stats/               # 统计数据
    │   └── weekly/          # 周统计数据
    ├── users/               # 用户 CRUD
    ├── posts/               # 帖子 CRUD
    ├── comments/            # 评论 CRUD
    ├── favorites/          # 收藏 CRUD
    ├── friends/             # 好友关系 CRUD
    ├── plans/              # 旅行计划 CRUD
    └── keys/               # 密钥管理
```

## 核心功能

### 1. 认证系统

#### 密钥体系
- **母密钥**: `1245678` (初始设置)
- **子密钥**: 由管理员生成，SHA256 加密存储

#### API 端点
- `POST /api/admin/auth/login` - 密钥登录
- `GET /api/admin/auth/verify` - 验证 Token

#### 前端实现
- `auth-context.tsx`: 提供认证状态管理
- `useAdminAuth()`: 获取认证状态 hook
- `useAdminLogout()`: 退出登录 hook

### 2. 数据看板

#### API 端点
- `GET /api/admin/stats` - 获取总统计数据
- `GET /api/admin/stats/weekly` - 获取近7日数据

#### 返回数据结构
```typescript
// stats
{
  stats: {
    totalUsers: number,
    todayUsers: number,
    totalPosts: number,
    totalComments: number,
    totalFavorites: number,
    totalFriends: number,
    totalPlans: number,
    activeKeys: number
  }
}

// weekly
{
  weekly: {
    dates: string[],      // ["4/11", "4/12", ...]
    users: number[],     // 每日新增用户
    posts: number[],    // 每日发帖
    plans: number[]     // 每日计划
  }
}
```

### 3. 公共组件

#### AdminTable 组件
位置: `src/app/management/AdminTable.tsx`

```typescript
// 属性
interface AdminTableProps {
  apiUrl: string;              // API 地址
  columns: Column[];           // 列配置
  title: string;              // 标题
  searchPlaceholder?: string; // 搜索框占位符
  onDelete?: (id: number) => Promise<boolean>; // 删除回调
}

// 列配置
interface Column {
  key: string;
  label: string;
  render?: (row: any) => React.ReactNode;
  isAction?: boolean;
}
```

#### useAdminTable Hook
```typescript
const { data, total, page, setPage, search, setSearch, loading, refetch, deleteItem } = useAdminTable(apiUrl);
```

#### Dashboard 组件
位置: `src/app/management/components.tsx`

```typescript
// Props
interface DashboardProps {
  stats: Stats | null;
  weekly: WeeklyData | null;
  loading: boolean;
}
```

#### useStats Hook
```typescript
const { stats, weekly, loading, refetch } = useStats();
```

### 4. 数据库表

#### schema.ts 表定义

```typescript
// users 表
export const users = mysqlTable('users', {
  id: serial('id').primaryKey(),
  phone: varchar('phone', { length: 32 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }),
  nickname: varchar('nickname', { length: 64 }),
  avatar: text('avatar'),
  gender: tinyint('gender').default(0),
  birthday: date('birthday'),
  region: varchar('region', { length: 128 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// posts 表
export const posts = mysqlTable('posts', {...});

// comments 表
export const comments = mysqlTable('comments', {...});

// favorites 表
export const favorites = mysqlTable('favorites', {...});

// friendships 表 (表名为 friends)
export const friendships = mysqlTable('friends', {...});

// plans 表
export const plans = mysqlTable('plans', {...});

// adminKeys 表
export const adminKeys = mysqlTable('admin_keys', {
  id: serial('id').primaryKey(),
  keyHash: varchar('key_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 64 }).notNull(),
  isMaster: tinyint('is_master').default(0),
  isActive: tinyint('is_active').default(1),
  expiresAt: timestamp('expires_at'),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

### 5. 各页面配置

#### 用户管理 (users/page.tsx)
```typescript
const columns = [
  { key: 'user', label: '用户', render: (...) => (...) },
  { key: 'phone', label: '手机号' },
  { key: 'gender', label: '性别', render: (...) => (...) },
  { key: 'createdAt', label: '注册时间', render: (...) => (...) },
];
```

#### 帖子管理 (posts/page.tsx)
```typescript
const columns = [
  { key: 'id', label: 'ID' },
  { key: 'title', label: '标题', render: (...) => (...) },
  { key: 'author', label: '作者', render: (...) => (...) },
  { key: 'privacy', label: '隐私', render: (...) => (...) },
  { key: 'createdAt', label: '发布时间', render: (...) => (...) },
];
```

#### 评论管理 (comments/page.tsx)
```typescript
const columns = [
  { key: 'id', label: 'ID' },
  { key: 'content', label: '内容', render: (...) => (...) },
  { key: 'author', label: '作者', render: (...) => (...) },
  { key: 'post', label: '帖子', render: (...) => (...) },
  { key: 'createdAt', label: '时间', render: (...) => (...) },
];
```

#### 收藏管理 (favorites/page.tsx)
```typescript
const columns = [
  { key: 'id', label: 'ID' },
  { key: 'user', label: '用户', render: (...) => (...) },
  { key: 'post', label: '帖子', render: (...) => (...) },
  { key: 'createdAt', label: '收藏时间', render: (...) => (...) },
];
```

#### 好友关系 (friends/page.tsx)
```typescript
const columns = [
  { key: 'id', label: 'ID' },
  { key: 'user', label: '用户', render: (...) => (...) },
  { key: 'friend', label: '好友', render: (...) => (...) },
  { key: 'createdAt', label: '时间', render: (...) => (...) },
];
```

#### 旅行计划 (plans/page.tsx)
```typescript
const columns = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: '计划名称', render: (...) => (...) },
  { key: 'user', label: '用户', render: (...) => (...) },
  { key: 'startDate', label: '开始日期', render: (...) => (...) },
  { key: 'endDate', label: '结束日期', render: (...) => (...) },
  { key: 'createdAt', label: '创建时间', render: (...) => (...) },
];
```

#### 密钥管理 (keys/page.tsx)
- 自定义 UI，包含创建、启用/禁用功能

### 6. API 列表

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/admin/auth/login | 密钥登录 |
| GET | /api/admin/auth/verify | 验证 Token |
| GET | /api/admin/stats | 统计数据 |
| GET | /api/admin/stats/weekly | 周统计 |
| GET | /api/admin/users | 用户列表 |
| DELETE | /api/admin/users | 删除用户 |
| GET | /api/admin/posts | 帖子列表 |
| DELETE | /api/admin/posts | 删除帖子 |
| GET | /api/admin/comments | 评论列表 |
| DELETE | /api/admin/comments | 删除评论 |
| GET | /api/admin/favorites | 收藏列表 |
| DELETE | /api/admin/favorites | 删除收藏 |
| GET | /api/admin/friends | 好友列表 |
| DELETE | /api/admin/friends | 删除好友 |
| GET | /api/admin/plans | 计划列表 |
| DELETE | /api/admin/plans | 删除计划 |
| GET | /api/admin/keys | 密钥列表 |
| POST | /api/admin/keys | 创建密钥 |
| PATCH | /api/admin/keys | 启用/禁用密钥 |

### 7. 布局与导航

#### Sidebar 菜单项
```typescript
const menuItems = [
  { path: '/management', icon: '📊', label: '数据看板', desc: '核心数据' },
  { path: '/management/users', icon: '👥', label: '用户', desc: '用户管理' },
  { path: '/management/posts', icon: '📝', label: '帖子', desc: '内容管理' },
  { path: '/management/comments', icon: '💬', label: '评论', desc: '互动数据' },
  { path: '/management/favorites', icon: '❤️', label: '收藏', desc: '收藏数据' },
  { path: '/management/friends', icon: '🤝', label: '好友', desc: '关系管理' },
  { path: '/management/plans', icon: '✈️', label: '计划', desc: '旅行计划' },
  { path: '/management/keys', icon: '🔑', label: '密钥', desc: '系统密钥' },
];
```

### 8. 样式规范

#### 管理后台样式模块
文件: `src/app/management/management.module.css`

主要 CSS 类:
- `.admin-layout` - 整体布局 (网格: sidebar + main)
- `.sidebar` - 侧边栏 (深色渐变背景)
- `.nav-item` - 导航项
- `.nav-item.is-active` - 选中状态
- `.content` - 内容区域
- `.page-header` - 页面头部
- `.kpi-row` - KPI 卡片行
- `.kpi-card` - KPI 卡片
- `.charts-grid` - 图表网格 (3列)
- `.chart-card` - 图表卡片
- `.bar-chart` - 柱状图
- `.bar-fill` - 柱子填充
- `.table-card` - 表格卡片
- `.data-table` - 数据表格
- `.table-pagination` - 分页
- `.action-btn` - 操作按钮
- `.delete` - 删除按钮样式

#### Colors
```css
/* 主色调 */
--primary: #6366f1;
--primary-light: #8b5cf6;

/* 背景 */
--bg-sidebar: linear-gradient(180deg, #1f1c4a 0%, #2d2654 100%);
--bg-main: #f5f6fa;

/* 文字 */
--text-primary: #1f2430;
--text-secondary: #6b7280;
--text-muted: #a5a5b8;
```

## 数据库初始化

### 创建 admin_keys 表

```sql
CREATE TABLE IF NOT EXISTS admin_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  key_hash VARCHAR(255) NOT NULL,
  name VARCHAR(64) NOT NULL,
  is_master TINYINT DEFAULT 0,
  is_active TINYINT DEFAULT 1,
  expires_at TIMESTAMP NULL,
  last_used_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY admin_keys_key_hash_idx (key_hash)
);
```

### 插入母密钥

```sql
-- 母密钥 1245678 的 SHA256 哈希
INSERT INTO admin_keys (key_hash, name, is_master, is_active)
VALUES ('a9d26f5d7e1f8c3b4a5e6d9f8c3b4a5e6d9f8c3b4a5e6d9f8c3b4a5e6d9f8c', '母密钥', 1, 1);
```

## 常见问题

### 1. 500 错误
- 检查数据库表是否存在
- 检查 schema.ts 中表名和字段是否与数据库一致
- 查看服务端错误日志

### 2. 认证失败
- 检查 localStorage 中的 admin_token
- 验证密钥是否正确
- 检查 Token 是否过期

### 3. 分页不工作
- 确保 API 返回 `{ list, total }` 格式
- 确保 total 是数字类型

### 4. 删除不工作
- 检查 DELETE 方法是否实现
- 检查 API 中解析 id 参数
- 确保表有对应的外键约���

## 部署注意事项

1. 确保数据库 `admin_keys` 表已创建
2. 母密钥需要手动插入数据库
3. 部署后需要重新构建: `npm run build`
4. 检查环境变量 `DATABASE_URL` 配置正确

## 更新日志

### 2026-04-18

#### 新增功能
- **周统计 API**: `/api/admin/stats/weekly` 返回近7日每日数据
- **刷新按钮**: 数据看板增加刷新按钮，支持手动刷新数据
- **柱状图优化**: 使用日期标签替代星期，梯度渐变填充

#### 界面优化
- KPI 卡片增加图标和阴影效果
- 页面头部增加刷新按钮布局
- 增加空数据状态提示

#### 问题修复
- 修复周统计 API 查询逻辑，使用 DATE() 函数精确匹配
- 修复柱状图无数据时高度为0的问题

#### 隐藏顶栏
- 在 `/management` 路由下自动隐藏全局 Header
- 使用 ConditionalHeader 组件判断路径
- 文件: `src/components/layout/ConditionalHeader.tsx`

#### 删除功能
- 所有列表页面增加删除功能 (users, posts, comments, favorites, friends, plans)
- AdminTable 组件增加 onDelete 回调属性

### 2026-04-19

#### 数据库更新
- posts 表新增 `status` 字段: normal / blocked / deleted
- comments 表新增 `status` 字段: normal / deleted
- plans 表新增 `status` 字段: normal / deleted

#### 用户管理
- 搜索支持手机号和昵称
- 显示数据统计：帖子、收藏、好友、计划数量
- 批量屏蔽功能

#### 帖子管理
- 状态字段：正常 / 已屏蔽 / 已删除
- 屏蔽：将 privacy 设为 blocked，status 设为 blocked，无法改回 public
- 删除：status 设为 deleted，用户不可见，管理端可见
- 彻底删除：从数据库删除及相关联数据（收藏、评论）

#### 评论管理
- 状态字段：正常 / 已删除
- 删除：status 设为 deleted
- 彻底删除：从数据库删除

#### 计划管理
- 状态字段：正常 / 已删除
- 删除：status 设为 deleted
- 彻底删除：从数据库删除

#### 合并功能
- 好友管理和收藏合并至用户管理
- 侧边栏移除 favorites 和 friends 入口
- 用户列表显示收藏数和好友数

#### 批量管理
- AdminTable 组件支持批量选择和操作
- 新增 batchActions 和 actions 属性
- 复选框全选功能