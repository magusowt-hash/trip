# 管理系统修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复管理后台的帖子/评论/计划管理页面，正确使用 status 字段，实现正常→屏蔽→彻底删除的完整流程

**Architecture:** 修改 API 路由支持 status 操作，更新前端页面显示真实 status 列和动态操作按钮

**Tech Stack:** Next.js App Router, Drizzle ORM, MySQL, TypeScript

---

## 文件结构

```
src/app/api/admin/
├── posts/route.ts       # 修改：支持 block/restore/soft-delete/permanent-delete
├── comments/route.ts     # 修改：添加 status 操作
└── plans/route.ts       # 修改：添加 status 操作

src/app/management/
├── posts/page.tsx       # 修改：显示真实 status 列，动态操作按钮
├── comments/page.tsx    # 修改：显示 status 列
├── plans/page.tsx       # 修改：显示 status 列
└── AdminTable.tsx      # 修改：支持动态操作按钮
```

---

## Task 1: 修改帖子 API 支持 status 操作

**Files:**
- Modify: `src/app/api/admin/posts/route.ts`

- [ ] **Step 1: 修改 PATCH 方法支持 status 操作**

将现有的 block/restore/delete 操作改为使用 status 字段：

```typescript
export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const action = searchParams.get('action');

    if (!id) {
      return NextResponse.json({ error: '缺少帖子ID' }, { status: 400 });
    }

    const postId = parseInt(id);

    // block: 屏蔽帖子 -> status = 'blocked'
    if (action === 'block') {
      await db.update(posts)
        .set({ status: 'blocked', updatedAt: new Date() })
        .where(eq(posts.id, postId));
      return NextResponse.json({ success: true, message: '已屏蔽' });
    }

    // restore: 恢复帖子 -> status = 'normal'
    if (action === 'restore') {
      await db.update(posts)
        .set({ status: 'normal', updatedAt: new Date() })
        .where(eq(posts.id, postId));
      return NextResponse.json({ success: true, message: '已恢复' });
    }

    // soft-delete: 软删除 -> status = 'deleted'
    if (action === 'soft-delete') {
      await db.update(posts)
        .set({ status: 'deleted', updatedAt: new Date() })
        .where(eq(posts.id, postId));
      return NextResponse.json({ success: true, message: '已删除' });
    }

    // permanent-delete: 彻底删除 -> 从数据库删除
    if (action === 'permanent-delete') {
      await db.delete(posts).where(eq(posts.id, postId));
      return NextResponse.json({ success: true, message: '已彻底删除' });
    }

    return NextResponse.json({ error: '无效操作' }, { status: 400 });
  } catch (error: any) {
    console.error('Posts PATCH error:', error);
    return NextResponse.json({ error: '操作失败: ' + error?.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: 修改 GET 方法支持 status 过滤**

添加可选的 status 查询参数：

```typescript
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = 10;
    const status = searchParams.get('status'); // 可选过滤
    const offset = (page - 1) * pageSize;

    let whereCondition;
    if (status && status !== 'all') {
      whereCondition = eq(posts.status, status);
    }

    const list = await db
      .select({
        id: posts.id,
        userId: posts.userId,
        title: posts.title,
        content: posts.content,
        privacy: posts.privacy,
        status: posts.status,
        topic: posts.topic,
        createdAt: posts.createdAt,
        userNickname: users.nickname,
        userPhone: users.phone,
      })
      .from(posts)
      .leftJoin(users, eq(posts.userId, users.id))
      .where(whereCondition)
      .orderBy(desc(posts.id))
      .limit(pageSize)
      .offset(offset);

    // ... (保持现有的 count 查询)
    
    return NextResponse.json({ list, total });
  } catch (error: any) {
    console.error('Posts GET error:', error);
    return NextResponse.json({ error: '获取帖子列表失败: ' + error?.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: 测试 API**

运行命令测试各操作：
```bash
# 测试获取帖子列表
curl -s -H "Authorization: Bearer TOKEN" "http://127.0.0.1:3001/api/admin/posts"

# 测试屏蔽操作
curl -s -X PATCH "http://127.0.0.1:3001/api/admin/posts?id=1&action=block" -H "Authorization: Bearer TOKEN"

# 测试恢复操作
curl -s -X PATCH "http://127.0.0.1:3001/api/admin/posts?id=1&action=restore" -H "Authorization: Bearer TOKEN"

# 测试软删除
curl -s -X PATCH "http://127.0.0.1:3001/api/admin/posts?id=1&action=soft-delete" -H "Authorization: Bearer TOKEN"

# 测试彻底删除
curl -s -X PATCH "http://127.0.0.1:3001/api/admin/posts?id=1&action=permanent-delete" -H "Authorization: Bearer TOKEN"
```

- [ ] **Step 4: 提交代码**

```bash
git add src/app/api/admin/posts/route.ts
git commit -m "fix: 帖子API使用status字段实现屏蔽/恢复/删除功能"
```

---

## Task 2: 修改评论 API 支持 status 操作

**Files:**
- Modify: `src/app/api/admin/comments/route.ts`

- [ ] **Step 1: 查看现有代码结构**

读取当前 comments/route.ts 了解现有实现

- [ ] **Step 2: 添加 status 字段到 SELECT**

修改 GET 方法，返回 status 字段：

```typescript
// 在 list 查询中添加
status: comments.status,
```

- [ ] **Step 3: 添加 PATCH 操作支持**

添加 soft-delete 和 permanent-delete 操作：

```typescript
export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const action = searchParams.get('action');

    if (!id) {
      return NextResponse.json({ error: '缺少评论ID' }, { status: 400 });
    }

    const commentId = parseInt(id);

    if (action === 'soft-delete') {
      await db.update(comments)
        .set({ status: 'deleted' })
        .where(eq(comments.id, commentId));
      return NextResponse.json({ success: true, message: '已删除' });
    }

    if (action === 'permanent-delete') {
      await db.delete(comments).where(eq(comments.id, commentId));
      return NextResponse.json({ success: true, message: '已彻底删除' });
    }

    return NextResponse.json({ error: '无效操作' }, { status: 400 });
  } catch (error: any) {
    console.error('Comments PATCH error:', error);
    return NextResponse.json({ error: '操作失败: ' + error?.message }, { status: 500 });
  }
}
```

- [ ] **Step 4: 修改 DELETE 方法改为软删除**

```typescript
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少评论ID' }, { status: 400 });
    }

    // 默认软删除
    await db.update(comments)
      .set({ status: 'deleted' })
      .where(eq(comments.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Comments DELETE error:', error);
    return NextResponse.json({ error: '删除失败: ' + error?.message }, { status: 500 });
  }
}
```

- [ ] **Step 5: 测试 API**

```bash
curl -s -H "Authorization: Bearer TOKEN" "http://127.0.0.1:3001/api/admin/comments"
```

- [ ] **Step 6: 提交代码**

```bash
git add src/app/api/admin/comments/route.ts
git commit -m "fix: 评论API添加status字段支持软删除"
```

---

## Task 3: 修改计划 API 支持 status 操作

**Files:**
- Modify: `src/app/api/admin/plans/route.ts`

- [ ] **Step 1: 查看现有代码结构**

读取当前 plans/route.ts 了解现有实现

- [ ] **Step 2: 添加 status 字段到 SELECT 和 PATCH/DELETE 操作**

参考 Task 2 的修改方式，为 plans API 添加相同的 status 操作

- [ ] **Step 3: 测试 API**

```bash
curl -s -H "Authorization: Bearer TOKEN" "http://127.0.0.1:3001/api/admin/plans"
```

- [ ] **Step 4: 提交代码**

```bash
git add src/app/api/admin/plans/route.ts
git commit -m "fix: 计划API添加status字段支持软删除"
```

---

## Task 4: 更新帖子管理页面

**Files:**
- Modify: `src/app/management/posts/page.tsx`

- [ ] **Step 1: 查看现有代码结构**

读取当前 posts/page.tsx

- [ ] **Step 2: 添加 status 列显示**

修改 columns 配置，添加 status 列：

```typescript
const columns = [
  { key: 'id', label: 'ID' },
  { 
    key: 'title', 
    label: '标题',
    render: (row: any) => <span className="user-name">{row.title}</span>
  },
  { 
    key: 'author', 
    label: '作者',
    render: (row: any) => row.userNickname || row.userPhone || '-'
  },
  { 
    key: 'status', 
    label: '状态',
    render: (row: any) => {
      const statusMap: Record<string, { label: string; className: string }> = { 
        normal: { label: '正常', className: 'status-normal' },
        blocked: { label: '已屏蔽', className: 'status-blocked' },
        deleted: { label: '已删除', className: 'status-deleted' }
      };
      const status = statusMap[row.status] || statusMap.normal;
      return (
        <span className={`status-badge ${status.className}`}>
          {status.label}
        </span>
      );
    }
  },
  { 
    key: 'createdAt', 
    label: '发布时间',
    render: (row: any) => new Date(row.createdAt).toLocaleDateString('zh-CN')
  },
];
```

- [ ] **Step 3: 添加动态操作按钮**

根据 status 显示不同操作：

```typescript
const getActions = (status: string) => {
  const actions = [];
  
  if (status === 'normal') {
    actions.push(
      { label: '屏蔽', variant: 'warning' as const, onClick: (ids: number[]) => handleAction(ids[0], 'block') },
      { label: '删除', variant: 'danger' as const, onClick: (ids: number[]) => handleAction(ids[0], 'soft-delete') }
    );
  } else if (status === 'blocked') {
    actions.push(
      { label: '恢复', variant: 'default' as const, onClick: (ids: number[]) => handleAction(ids[0], 'restore') },
      { label: '删除', variant: 'danger' as const, onClick: (ids: number[]) => handleAction(ids[0], 'soft-delete') }
    );
  } else if (status === 'deleted') {
    actions.push(
      { label: '恢复', variant: 'default' as const, onClick: (ids: number[]) => handleAction(ids[0], 'restore') },
      { label: '彻底删除', variant: 'danger' as const, onClick: (ids: number[]) => handleAction(ids[0], 'permanent-delete') }
    );
  }
  
  return actions;
};
```

- [ ] **Step 4: 更新 AdminTable 使用动态 actions**

修改页面组件，根据每行数据状态传递不同的操作：

```typescript
// 在 AdminTable 的 columns 中添加 actions render
{
  key: 'actions',
  label: '操作',
  isAction: true,
  render: (row: any) => {
    const rowActions = getActions(row.status);
    return (
      <div className="action-btns">
        {rowActions.map((action, i) => (
          <button
            key={i}
            className={`action-btn ${action.variant === 'danger' ? 'delete' : action.variant === 'warning' ? 'warning' : ''}`}
            onClick={() => action.onClick([row.id])}
          >
            {action.label}
          </button>
        ))}
      </div>
    );
  }
}
```

- [ ] **Step 5: 更新 CSS 样式**

在 management.module.css 中添加状态样式：

```css
.status-normal {
  color: #52c41a;
}

.status-blocked {
  color: #fa8c16;
}

.status-deleted {
  color: #f5222d;
}
```

- [ ] **Step 6: 测试页面**

访问 http://127.0.0.1:3001/management/posts 检查：
- 状态列正确显示
- 不同状态显示不同操作按钮

- [ ] **Step 7: 提交代码**

```bash
git add src/app/management/posts/page.tsx
git add src/app/management/management.module.css
git commit -m "fix: 帖子页面显示真实status和动态操作按钮"
```

---

## Task 5: 更新评论管理页面

**Files:**
- Modify: `src/app/management/comments/page.tsx`

- [ ] **Step 1: 添加 status 列**

修改 columns，添加 status 显示列

- [ ] **Step 2: 添加操作按钮**

根据 status 显示不同操作：
- normal: 显示「删除」
- deleted: 显示「彻底删除」

- [ ] **Step 3: 测试页面**

访问 http://127.0.0.1:3001/management/comments

- [ ] **Step 4: 提交代码**

```bash
git add src/app/management/comments/page.tsx
git commit -m "fix: 评论页面添加status列和操作按钮"
```

---

## Task 6: 更新计划管理页面

**Files:**
- Modify: `src/app/management/plans/page.tsx`

- [ ] **Step 1: 添加 status 列**

修改 columns，添加 status 显示列

- [ ] **Step 2: 添加操作按钮**

根据 status 显示不同操作

- [ ] **Step 3: 测试页面**

访问 http://127.0.0.1:3001/management/plans

- [ ] **Step 4: 提交代码**

```bash
git add src/app/management/plans/page.tsx
git commit -m "fix: 计划页面添加status列和操作按钮"
```

---

## Task 7: 最终验证

- [ ] **Step 1: 运行 TypeScript 检查**

```bash
npm run typecheck
```

- [ ] **Step 2: 构建项目**

```bash
npm run build
```

- [ ] **Step 3: 测试完整流程**

1. 访问 /management/login 登录
2. 访问 /management/posts 测试：屏蔽、恢复、删除、彻底删除
3. 访问 /management/comments 测试：删除、彻底删除
4. 访问 /management/plans 测试：删除、彻底删除
5. 确认所有状态正确显示

- [ ] **Step 4: 提交最终更改**

```bash
git add -A
git commit -m "fix: 管理后台完整修复 - status字段和删除逻辑"
```