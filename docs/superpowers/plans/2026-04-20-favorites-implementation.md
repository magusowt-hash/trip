# 收藏功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现用户收藏帖子功能，支持 toggle 收藏状态，用户个人页面查看收藏列表，管理后台查看收藏统计

**Architecture:** 使用 favorites 表记录收藏关系，通过唯一索引 (post_id, user_id) 防止重复收藏。API 使用 drizzle-orm 与 MySQL 交互。

**Tech Stack:** Next.js App Router, Drizzle ORM, MySQL

---

### 任务 1: 创建 POST /api/posts/[id]/favorite API

**文件:**
- 创建: `/root/trip/src/app/api/posts/[id]/favorite/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { favorites, posts } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { verifyAuthToken } from '@/server/auth/jwt';
import { getAuthTokenFromRequest } from '@/server/auth/cookies';
import type { UploadedFile } from '@/lib/shared-data';

async function getCurrentUserId(request: NextRequest): Promise<number | null> {
  const token = getAuthTokenFromRequest(request);
  if (!token) return null;
  try {
    const payload = await verifyAuthToken(token);
    return Number(payload.sub);
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId(request);
    if (!userId) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { id } = await params;
    const postId = Number(id);
    if (!postId || isNaN(postId)) {
      return NextResponse.json({ error: '无效的帖子ID' }, { status: 400 });
    }

    const existing = await db
      .select({ id: favorites.id })
      .from(favorites)
      .where(and(eq(favorites.postId, postId), eq(favorites.userId, userId)))
      .limit(1);

    let favorited: boolean;
    if (existing.length > 0) {
      await db.delete(favorites).where(eq(favorites.id, existing[0].id));
      favorited = false;
    } else {
      await db.insert(favorites).values({ postId, userId });
      favorited = true;
    }

    const countResult = await db.execute<{ cnt: number }>(
      sql`SELECT COUNT(*) as cnt FROM favorites WHERE post_id = ${postId}`
    );
    const favoritesCnt = Number(countResult[0]?.cnt || 0);

    await db
      .update(posts)
      .set({ favoritesCnt })
      .where(eq(posts.id, postId));

    return NextResponse.json({ favorited, favoritesCnt });
  } catch (error) {
    console.error('Favorite error:', error);
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}
```

- [ ] **Step 1: 创建 /root/trip/src/app/api/posts/[id]/favorite/route.ts**
- [ ] **Step 2: 测试 API**
- [ ] **Step 3: 提交**

---

### 任务 2: 更新 PostDetailModal 收藏按钮

**文件:**
- 修改: `/root/trip/src/modules/post/PostDetailModal/index.tsx:195-212`

- [ ] **Step 1: 添加 favorited 状态**

在 PostDetailModal 组件中添加:
```typescript
const [favorited, setFavorited] = useState(false);
```

- [ ] **Step 2: 更新 handleFavorite 函数**

```typescript
async function handleFavorite() {
  if (!postId) return;
  try {
    const res = await fetch(`/api/posts/${postId}/favorite`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '操作失败');
      return;
    }
    const data = await res.json();
    setFavorited(data.favorited);
    setLocalFavorites(data.favoritesCnt);
  } catch {
    alert('操作失败');
  }
}
```

- [ ] **Step 3: 更新收藏按钮显示**

找到收藏按钮，使用 favorited 状态显示 ❤️ 或 🤍

- [ ] **Step 4: 提交**

---

### 任务 3: 创建 GET /api/favorites API

**文件:**
- 创建: `/root/trip/src/app/api/favorites/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { favorites, posts } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { verifyAuthToken } from '@/server/auth/jwt';
import { getAuthTokenFromRequest } from '@/server/auth/cookies';

async function getCurrentUserId(request: NextRequest): Promise<number | null> {
  const token = getAuthTokenFromRequest(request);
  if (!token) return null;
  try {
    const payload = await verifyAuthToken(token);
    return Number(payload.sub);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

    let conditions = [eq(favorites.userId, userId)];

    const dbFavorites = await db
      .select({
        id: favorites.id,
        postId: favorites.postId,
        createdAt: favorites.createdAt,
        title: posts.title,
        coverImageUrl: posts.coverImageUrl,
        topic: posts.topic,
      })
      .from(favorites)
      .leftJoin(posts, eq(favorites.postId, posts.id))
      .where(and(...conditions))
      .orderBy(desc(favorites.createdAt))
      .limit(limit + 1);

    const hasMore = dbFavorites.length > limit;
    const sliced = hasMore ? dbFavorites.slice(0, limit) : dbFavorites;

    return NextResponse.json({
      favorites: sliced,
      nextCursor: hasMore ? String(sliced[sliced.length - 1]?.createdAt) : null,
      hasMore,
    });
  } catch (error) {
    console.error('Get favorites error:', error);
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}
```

- [ ] **Step 1: 创建 /root/trip/src/app/api/favorites/route.ts**
- [ ] **Step 2: 提交**

---

### 任务 4: 用户收藏列表页面

**文件:**
- 创建: `/root/trip/src/app/(shell)/user/favorites/page.tsx`

参考现有用户帖子页面实现，显示收藏的帖子列表。

- [ ] **Step 1: 创建收藏列表页面**
- [ ] **Step 2: 提交**

---

### 任务 5: 管理后台收藏 API

**文件:**
- 创建: `/root/trip/src/app/api/admin/favorites/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { favorites, posts, users } from '@/db/schema';
import { eq, desc, sql, and } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = 10;
    const offset = (page - 1) * pageSize;

    const list = await db
      .select({
        id: favorites.id,
        postId: favorites.postId,
        userId: favorites.userId,
        createdAt: favorites.createdAt,
        postTitle: posts.title,
        userNickname: users.nickname,
      })
      .from(favorites)
      .leftJoin(posts, eq(favorites.postId, posts.id))
      .leftJoin(users, eq(favorites.userId, users.id))
      .orderBy(desc(favorites.createdAt))
      .limit(pageSize)
      .offset(offset);

    const countResult = await db.execute<{ cnt: number }>(
      sql`SELECT COUNT(*) as cnt FROM favorites`
    );
    const total = Number(countResult[0]?.cnt || 0);

    return NextResponse.json({ favorites: list, total });
  } catch (error) {
    console.error('Admin favorites error:', error);
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}
```

- [ ] **Step 1: 创建 /root/trip/src/app/api/admin/favorites/route.ts**
- [ ] **Step 2: 提交**

---

**计划完成，两种执行方式:**

1. **子任务驱动 (推荐)** - 每任务分配子agent，任务间 review
2. **inline 执行** - 本会话批量执行，检查点 review

选择哪种?