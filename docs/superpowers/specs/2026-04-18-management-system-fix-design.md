# 管理系统修复设计

## 问题现状

1. **帖子页面**
   - 显示"隐私"作为状态，实际显示的是 privacy 字段（public/private）
   - 屏蔽操作修改的是 `privacy: 'private'`，不是真正的 status 字段
   - status 字段存在但未被使用

2. **评论/计划页面**
   - 完全没有显示 status 列

3. **删除逻辑缺失**
   - 没有实现：正常→屏蔽→彻底删除 的完整流程

## 设计方案

### 1. 数据状态定义

使用 `status` 字段表示数据的三种状态：

| status 值 | 含义 | 前端显示 | 操作 |
|-----------|------|----------|------|
| `normal` | 正常 | 正常（绿色） | 可屏蔽 |
| `blocked` | 已屏蔽 | 已屏蔽（橙色） | 可恢复/可删除 |
| `deleted` | 已删除（软删除） | 已删除（红色） | 可彻底删除 |

### 2. API 行为设计

**帖子/评论/计划 的 PATCH 操作：**

| action | 操作 |
|--------|------|
| `block` | 设置 status = 'blocked' |
| `restore` | 设置 status = 'normal' |
| `soft-delete` | 设置 status = 'deleted' |
| `permanent-delete` | 从数据库 DELETE |

**GET 列表时：**
- 默认返回所有数据（包括已屏蔽、已删除）
- 支持 `?status=normal|blocked|deleted` 过滤

### 3. 页面 UI 设计

**帖子列表列设计：**

| 列名 | 显示内容 |
|------|----------|
| ID | 帖子ID |
| 标题 | 帖子标题 |
| 作者 | 用户昵称/手机号 |
| 状态 | normal→正常（绿）blocked→已屏蔽（橙）deleted→已删除（红） |
| 发布时间 | 创建时间 |
| 操作 | 屏蔽/恢复/删除/彻底删除 按钮 |

**评论区列设计：**
- ID、内容、作者、帖子、状态、时间、操作

**计划区列设计：**
- ID、计划名、用户、开始/结束日期、状态、创建时间、操作

### 4. 操作按钮逻辑

**帖子操作按钮：**
- normal 状态：显示「屏蔽」「删除」
- blocked 状态：显示「恢复」「删除」
- deleted 状态：显示「恢复」「彻底删除」

**评论/计划操作按钮：**
- normal 状态：显示「删除」
- deleted 状态：显示「彻底删除」
- 简化版：直接删除 + 彻底删除

### 5. API 路由修改

修改 `/api/admin/posts/route.ts`：
- PATCH 支持 block/restore/soft-delete/permanent-delete 操作
- GET 支持 status 过滤参数

修改 `/api/admin/comments/route.ts`：
- 同样的 status 操作

修改 `/api/admin/plans/route.ts`：
- 同样的 status 操作

### 6. 文件修改清单

1. `src/app/api/admin/posts/route.ts` - 修复状态操作
2. `src/app/api/admin/comments/route.ts` - 添加状态操作
3. `src/app/api/admin/plans/route.ts` - 添加状态操作
4. `src/app/management/posts/page.tsx` - 显示真实 status 列
5. `src/app/management/comments/page.tsx` - 显示 status 列
6. `src/app/management/plans/page.tsx` - 显示 status 列
7. `src/app/management/AdminTable.tsx` - 支持动态操作按钮