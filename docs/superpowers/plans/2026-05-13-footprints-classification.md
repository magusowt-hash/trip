# Footprints Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add playlist-style classification groups to the footprints page, replacing the flat visited_places list with a multi-group system.

**Architecture:** Two new DB tables (`footprint_groups`, `footprint_group_items`) store the groups and their item associations. API routes under `/api/footprints/` handle CRUD. The footprints page right panel shows group tabs with item cards. The leaderboard's "已去" action auto-adds items to the user's default group.

**Tech Stack:** Next.js 14 App Router, Drizzle ORM (MySQL), TypeScript, CSS Modules

---

## File Structure

```
New files:
  src/db/schema.footprints.ts                    # Drizzle table definitions
  src/app/api/footprints/groups/route.ts         # GET list + POST create
  src/app/api/footprints/groups/[id]/route.ts    # PATCH + DELETE
  src/app/api/footprints/groups/[id]/items/route.ts # GET items + POST add + DELETE remove
  src/app/api/footprints/default/items/route.ts  # POST add to default + DELETE remove
  src/app/api/admin/footprints/route.ts          # Admin: GET all groups + DELETE
  src/app/management/footprints/page.tsx          # Admin page

Modified files:
  src/db/schema.ts                                # Re-export new tables
  src/app/(shell)/footprints/page.tsx             # Right panel UI
  src/app/(shell)/footprints/footprints-page.module.css # Right panel styles
  src/app/(shell)/lists/page.tsx                  # handleVisited integration
  src/app/api/user/lists/route.ts                 # visitedPlaces sync
  src/app/management/layout.tsx                   # Nav item
```

---

### Task 1: Database Schema

**Files:**
- Create: `src/db/schema.footprints.ts`
- Modify: `src/db/schema.ts` (append import+export at end)

- [ ] **Step 1: Create schema file**

```typescript
// src/db/schema.footprints.ts
import { mysqlTable, serial, int, varchar, tinyint, timestamp, uniqueIndex, index } from 'drizzle-orm/mysql-core';

export const footprintGroups = mysqlTable(
  'footprint_groups',
  {
    id: serial('id').primaryKey(),
    userId: int('user_id').notNull(),
    name: varchar('name', { length: 64 }).notNull(),
    isDefault: tinyint('is_default').default(0),
    sortOrder: int('sort_order').default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index('fp_groups_user_id_idx').on(t.userId),
    userDefaultIdx: index('fp_groups_user_default_idx').on(t.userId, t.isDefault),
  }),
);

export const footprintGroupItems = mysqlTable(
  'footprint_group_items',
  {
    id: serial('id').primaryKey(),
    groupId: int('group_id').notNull(),
    listItemId: int('list_item_id').notNull(),
    addedAt: timestamp('added_at').notNull().defaultNow(),
  },
  (t) => ({
    groupItemUnique: uniqueIndex('fp_group_items_unique').on(t.groupId, t.listItemId),
    groupIdIdx: index('fp_group_items_group_id_idx').on(t.groupId),
  }),
);
```

- [ ] **Step 2: Export from main schema file**

Append to `src/db/schema.ts`:

```typescript
// Footprints classification
export { footprintGroups, footprintGroupItems } from './schema.footprints';
```

- [ ] **Step 3: Push DB schema changes**

Run: `npx drizzle-kit push`

Expected: No errors, tables created in DB.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.footprints.ts src/db/schema.ts
git commit -m "feat: add footprint_groups and footprint_group_items tables"
```

---

### Task 2: Shared Auth Helper for Footprint APIs

**Files:**
- Create: `src/app/api/footprints/_auth.ts` (helper module, Next.js ignores `_` prefixed folders in routing)

- [ ] **Step 1: Create auth helper**

```typescript
// src/app/api/footprints/_auth.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { verifyAuthToken, type AuthJwtPayload } from '@/server/auth/jwt';
import { getAuthTokenFromRequest } from '@/server/auth/cookies';

interface AuthResult {
  authorized: false;
  response: NextResponse;
  userId?: never;
} | {
  authorized: true;
  response?: never;
  userId: number;
}

export async function authenticateFootprintRequest(req: NextRequest): Promise<AuthResult> {
  const token = getAuthTokenFromRequest(req);
  if (!token) {
    return {
      authorized: false,
      response: NextResponse.json({ error: '未登录，请先登录' }, { status: 401 }),
    };
  }

  let payload: AuthJwtPayload;
  try {
    payload = await verifyAuthToken(token);
  } catch {
    return {
      authorized: false,
      response: NextResponse.json({ error: '未登录，请先登录' }, { status: 401 }),
    };
  }

  const userId = Number(payload.sub);
  if (!Number.isFinite(userId)) {
    return {
      authorized: false,
      response: NextResponse.json({ error: '无效的用户ID' }, { status: 401 }),
    };
  }

  return { authorized: true, userId };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/footprints/_auth.ts
git commit -m "feat: add shared auth helper for footprint APIs"
```

---

### Task 3: API - Groups CRUD (GET + POST)

**Files:**
- Create: `src/app/api/footprints/groups/route.ts`

- [ ] **Step 1: Create the route handler**

```typescript
// src/app/api/footprints/groups/route.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq, asc, sql } from 'drizzle-orm';
import { db } from '@/db';
import { footprintGroups, footprintGroupItems } from '@/db/schema';
import { authenticateFootprintRequest } from '../_auth';

const MAX_GROUPS = 20;

export async function GET(req: NextRequest) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  try {
    const groups = await db
      .select({
        id: footprintGroups.id,
        name: footprintGroups.name,
        isDefault: footprintGroups.isDefault,
        sortOrder: footprintGroups.sortOrder,
        itemCount: sql<number>`count(${footprintGroupItems.id})`,
        createdAt: footprintGroups.createdAt,
      })
      .from(footprintGroups)
      .leftJoin(footprintGroupItems, eq(footprintGroups.id, footprintGroupItems.groupId))
      .where(eq(footprintGroups.userId, auth.userId))
      .groupBy(footprintGroups.id)
      .orderBy(asc(footprintGroups.sortOrder), asc(footprintGroups.id));

    return NextResponse.json({ groups }, { status: 200 });
  } catch (err) {
    console.error('GET /api/footprints/groups error:', err);
    return NextResponse.json({ error: '获取分类组失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  try {
    const { name } = (await req.json()) as { name?: string };
    if (!name || !name.trim()) {
      return NextResponse.json({ error: '分类组名不能为空' }, { status: 400 });
    }

    const existing = await db
      .select({ count: sql<number>`count(*)` })
      .from(footprintGroups)
      .where(eq(footprintGroups.userId, auth.userId));
    if ((existing[0]?.count ?? 0) >= MAX_GROUPS) {
      return NextResponse.json({ error: `最多创建${MAX_GROUPS}个分类组` }, { status: 400 });
    }

    const maxOrder = await db
      .select({ max: sql<number>`coalesce(max(${footprintGroups.sortOrder}), 0)` })
      .from(footprintGroups)
      .where(eq(footprintGroups.userId, auth.userId));

    const result = await db.insert(footprintGroups).values({
      userId: auth.userId,
      name: name.trim(),
      isDefault: 0,
      sortOrder: (maxOrder[0]?.max ?? 0) + 1,
    });

    return NextResponse.json({
      group: {
        id: result[0].insertId,
        name: name.trim(),
        isDefault: 0,
        sortOrder: (maxOrder[0]?.max ?? 0) + 1,
        itemCount: 0,
      },
    }, { status: 201 });
  } catch (err) {
    console.error('POST /api/footprints/groups error:', err);
    return NextResponse.json({ error: '创建分类组失败' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/footprints/groups/route.ts
git commit -m "feat: add GET+POST /api/footprints/groups endpoints"
```

---

### Task 4: API - Groups CRUD (PATCH + DELETE by ID)

**Files:**
- Create: `src/app/api/footprints/groups/[id]/route.ts`

- [ ] **Step 1: Create the route handler**

```typescript
// src/app/api/footprints/groups/[id]/route.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { footprintGroups } from '@/db/schema';
import { authenticateFootprintRequest } from '../../_auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  const groupId = parseInt(params.id);
  if (!Number.isFinite(groupId)) {
    return NextResponse.json({ error: '无效的分类组ID' }, { status: 400 });
  }

  try {
    const [group] = await db
      .select()
      .from(footprintGroups)
      .where(eq(footprintGroups.id, groupId));
    if (!group || group.userId !== auth.userId) {
      return NextResponse.json({ error: '分类组不存在' }, { status: 404 });
    }

    const { name, is_default } = (await req.json()) as { name?: string; is_default?: boolean };

    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ error: '分类组名不能为空' }, { status: 400 });
      }
      updateData.name = name.trim();
    }

    if (is_default === true) {
      await db
        .update(footprintGroups)
        .set({ isDefault: 0 })
        .where(eq(footprintGroups.userId, auth.userId));
      updateData.isDefault = 1;
    }

    await db.update(footprintGroups).set(updateData).where(eq(footprintGroups.id, groupId));

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('PATCH /api/footprints/groups/[id] error:', err);
    return NextResponse.json({ error: '更新分类组失败' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  const groupId = parseInt(params.id);
  if (!Number.isFinite(groupId)) {
    return NextResponse.json({ error: '无效的分类组ID' }, { status: 400 });
  }

  try {
    const [group] = await db
      .select()
      .from(footprintGroups)
      .where(eq(footprintGroups.id, groupId));
    if (!group || group.userId !== auth.userId) {
      return NextResponse.json({ error: '分类组不存在' }, { status: 404 });
    }

    await db.delete(footprintGroups).where(eq(footprintGroups.id, groupId));

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('DELETE /api/footprints/groups/[id] error:', err);
    return NextResponse.json({ error: '删除分类组失败' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/footprints/groups/[id]/route.ts
git commit -m "feat: add PATCH+DELETE /api/footprints/groups/[id] endpoints"
```

---

### Task 5: API - Group Items (GET + POST + DELETE)

**Files:**
- Create: `src/app/api/footprints/groups/[id]/items/route.ts`

- [ ] **Step 1: Create the route handler**

```typescript
// src/app/api/footprints/groups/[id]/items/route.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/db';
import { footprintGroups, footprintGroupItems } from '@/db/schema';
import { listItems, lists } from '@/db/schema';
import { authenticateFootprintRequest } from '../../../_auth';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  const groupId = parseInt(params.id);
  if (!Number.isFinite(groupId)) {
    return NextResponse.json({ error: '无效的分类组ID' }, { status: 400 });
  }

  try {
    const [group] = await db
      .select()
      .from(footprintGroups)
      .where(eq(footprintGroups.id, groupId));
    if (!group || group.userId !== auth.userId) {
      return NextResponse.json({ error: '分类组不存在' }, { status: 404 });
    }

    const items = await db
      .select({
        id: footprintGroupItems.id,
        listItemId: footprintGroupItems.listItemId,
        addedAt: footprintGroupItems.addedAt,
        title: listItems.title,
        coverImage: listItems.coverImage,
        description: listItems.description,
        lng: listItems.lng,
        lat: listItems.lat,
        address: listItems.address,
        listId: listItems.listId,
        listName: lists.name,
      })
      .from(footprintGroupItems)
      .innerJoin(listItems, eq(footprintGroupItems.listItemId, listItems.id))
      .leftJoin(lists, eq(listItems.listId, lists.id))
      .where(eq(footprintGroupItems.groupId, groupId))
      .orderBy(desc(footprintGroupItems.id));

    return NextResponse.json({ items }, { status: 200 });
  } catch (err) {
    console.error('GET /api/footprints/groups/[id]/items error:', err);
    return NextResponse.json({ error: '获取分类组地点失败' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  const groupId = parseInt(params.id);
  if (!Number.isFinite(groupId)) {
    return NextResponse.json({ error: '无效的分类组ID' }, { status: 400 });
  }

  try {
    const [group] = await db
      .select()
      .from(footprintGroups)
      .where(eq(footprintGroups.id, groupId));
    if (!group || group.userId !== auth.userId) {
      return NextResponse.json({ error: '分类组不存在' }, { status: 404 });
    }

    const { list_item_id } = (await req.json()) as { list_item_id?: number };
    if (!list_item_id || !Number.isFinite(list_item_id)) {
      return NextResponse.json({ error: '无效的地点ID' }, { status: 400 });
    }

    const [existing] = await db
      .select()
      .from(footprintGroupItems)
      .where(
        and(
          eq(footprintGroupItems.groupId, groupId),
          eq(footprintGroupItems.listItemId, list_item_id),
        ),
      );

    if (existing) {
      return NextResponse.json({ error: '该地点已在此分类组中' }, { status: 409 });
    }

    const result = await db.insert(footprintGroupItems).values({
      groupId,
      listItemId: list_item_id,
    });

    return NextResponse.json({ id: result[0].insertId }, { status: 201 });
  } catch (err) {
    console.error('POST /api/footprints/groups/[id]/items error:', err);
    return NextResponse.json({ error: '添加地点失败' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  const groupId = parseInt(params.id);
  if (!Number.isFinite(groupId)) {
    return NextResponse.json({ error: '无效的分类组ID' }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const itemIdParam = searchParams.get('item_id');

  // If item_id query param provided, remove specific item from group
  if (itemIdParam) {
    const itemId = parseInt(itemIdParam);
    if (!Number.isFinite(itemId)) {
      return NextResponse.json({ error: '无效的地点ID' }, { status: 400 });
    }

    try {
      const [group] = await db
        .select()
        .from(footprintGroups)
        .where(eq(footprintGroups.id, groupId));
      if (!group || group.userId !== auth.userId) {
        return NextResponse.json({ error: '分类组不存在' }, { status: 404 });
      }

      await db
        .delete(footprintGroupItems)
        .where(
          and(
            eq(footprintGroupItems.groupId, groupId),
            eq(footprintGroupItems.listItemId, itemId),
          ),
        );

      return NextResponse.json({ success: true }, { status: 200 });
    } catch (err) {
      console.error('DELETE item from group error:', err);
      return NextResponse.json({ error: '移除地点失败' }, { status: 500 });
    }
  }

  // Otherwise, delete specific group_item record by its own id
  try {
    const [item] = await db
      .select()
      .from(footprintGroupItems)
      .where(eq(footprintGroupItems.id, groupId));
    if (!item) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    const [group] = await db
      .select()
      .from(footprintGroups)
      .where(eq(footprintGroups.id, item.groupId));
    if (!group || group.userId !== auth.userId) {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    await db.delete(footprintGroupItems).where(eq(footprintGroupItems.id, groupId));

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('DELETE /api/footprints/groups/[id]/items error:', err);
    return NextResponse.json({ error: '移除失败' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/footprints/groups/[id]/items/route.ts
git commit -m "feat: add items endpoints for footprint groups (GET+POST+DELETE)"
```

---

### Task 6: API - Default Group Convenience Endpoint

**Files:**
- Create: `src/app/api/footprints/default/items/route.ts`

- [ ] **Step 1: Create the route handler**

```typescript
// src/app/api/footprints/default/items/route.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/db';
import { footprintGroups, footprintGroupItems, users } from '@/db/schema';
import { authenticateFootprintRequest } from '../../_auth';

async function ensureDefaultGroup(userId: number): Promise<number> {
  const [defaultGroup] = await db
    .select()
    .from(footprintGroups)
    .where(
      and(
        eq(footprintGroups.userId, userId),
        eq(footprintGroups.isDefault, 1),
      ),
    );

  if (defaultGroup) return defaultGroup.id;

  const [newGroup] = await db.insert(footprintGroups).values({
    userId,
    name: '我的足迹',
    isDefault: 1,
    sortOrder: 0,
  });
  return newGroup.insertId;
}

export async function POST(req: NextRequest) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  try {
    const { list_item_id } = (await req.json()) as { list_item_id?: number };
    if (!list_item_id || !Number.isFinite(list_item_id)) {
      return NextResponse.json({ error: '无效的地点ID' }, { status: 400 });
    }

    const groupId = await ensureDefaultGroup(auth.userId);

    // Idempotent: skip if already exists
    const [existing] = await db
      .select()
      .from(footprintGroupItems)
      .where(
        and(
          eq(footprintGroupItems.groupId, groupId),
          eq(footprintGroupItems.listItemId, list_item_id),
        ),
      );

    if (!existing) {
      await db.insert(footprintGroupItems).values({
        groupId,
        listItemId: list_item_id,
      });
    }

    // Sync visited_places JSON column
    const [user] = await db
      .select({ visitedPlaces: users.visitedPlaces })
      .from(users)
      .where(eq(users.id, auth.userId));

    const visited = Array.isArray(user?.visitedPlaces)
      ? user.visitedPlaces
      : [];
    const idx = visited.findIndex(
      (v: any) => v.listItemId === list_item_id,
    );
    if (idx < 0) {
      visited.push({
        listItemId: list_item_id,
        addedAt: new Date().toISOString(),
      });
      await db
        .update(users)
        .set({ visitedPlaces: visited })
        .where(eq(users.id, auth.userId));
    }

    return NextResponse.json({ success: true, group_id: groupId }, { status: 200 });
  } catch (err) {
    console.error('POST /api/footprints/default/items error:', err);
    return NextResponse.json({ error: '添加失败' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const itemIdParam = searchParams.get('list_item_id');

  if (!itemIdParam) {
    return NextResponse.json({ error: '缺少list_item_id参数' }, { status: 400 });
  }

  const listItemId = parseInt(itemIdParam);
  if (!Number.isFinite(listItemId)) {
    return NextResponse.json({ error: '无效的地点ID' }, { status: 400 });
  }

  try {
    const [defaultGroup] = await db
      .select()
      .from(footprintGroups)
      .where(
        and(
          eq(footprintGroups.userId, auth.userId),
          eq(footprintGroups.isDefault, 1),
        ),
      );

    if (defaultGroup) {
      await db
        .delete(footprintGroupItems)
        .where(
          and(
            eq(footprintGroupItems.groupId, defaultGroup.id),
            eq(footprintGroupItems.listItemId, listItemId),
          ),
        );
    }

    // Sync visited_places JSON column
    const [user] = await db
      .select({ visitedPlaces: users.visitedPlaces })
      .from(users)
      .where(eq(users.id, auth.userId));

    const visited = Array.isArray(user?.visitedPlaces)
      ? user.visitedPlaces
      : [];
    const filtered = visited.filter(
      (v: any) => v.listItemId !== listItemId,
    );
    await db
      .update(users)
      .set({ visitedPlaces: filtered })
      .where(eq(users.id, auth.userId));

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('DELETE /api/footprints/default/items error:', err);
    return NextResponse.json({ error: '移除失败' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/footprints/default/items/route.ts
git commit -m "feat: add default group convenience endpoint for visited tracking"
```

---

### Task 7: Footprints Page - Right Panel UI

**Files:**
- Modify: `src/app/(shell)/footprints/page.tsx`

- [ ] **Step 1: Replace page content with full implementation**

```typescript
// src/app/(shell)/footprints/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import PlanMap, { type MapMarker } from '@/components/PlanMap';
import styles from './footprints-page.module.css';

interface FootprintGroup {
  id: number;
  name: string;
  isDefault: number;
  sortOrder: number;
  itemCount: number;
}

interface FootprintItem {
  id: number;
  listItemId: number;
  title: string;
  coverImage: string | null;
  description: string | null;
  lng: string | null;
  lat: string | null;
  address: string | null;
  listId: number | null;
  listName: string | null;
  addedAt: string;
}

export default function FootprintsPage() {
  const [groups, setGroups] = useState<FootprintGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [items, setItems] = useState<FootprintItem[]>([]);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [focusPosition, setFocusPosition] = useState<[number, number] | null>(null);
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    item: FootprintItem;
    x: number;
    y: number;
  } | null>(null);
  const [addToGroupOpen, setAddToGroupOpen] = useState(false);
  const [targetItem, setTargetItem] = useState<FootprintItem | null>(null);

  const mapInstanceRef = useRef<any>(null);

  const handleMapReady = (map: any) => {
    mapInstanceRef.current = map;
  };

  // Load groups on mount
  useEffect(() => {
    loadGroups();
  }, []);

  // Load items when selected group changes
  useEffect(() => {
    if (selectedGroupId) {
      loadItems(selectedGroupId);
    } else {
      setItems([]);
    }
  }, [selectedGroupId]);

  // Derive markers from items
  useEffect(() => {
    const newMarkers: MapMarker[] = items
      .filter(it => it.lng && it.lat)
      .map(it => ({
        id: it.listItemId,
        position: [parseFloat(it.lng!), parseFloat(it.lat!)] as [number, number],
        title: it.title,
        address: it.address || undefined,
        description: it.description || undefined,
      }));
    setMarkers(newMarkers);
  }, [items]);

  async function loadGroups() {
    try {
      const res = await fetch('/api/footprints/groups', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setGroups(data.groups || []);
      if (data.groups?.length > 0 && !selectedGroupId) {
        const defaultGroup = data.groups.find((g: FootprintGroup) => g.isDefault === 1);
        setSelectedGroupId(defaultGroup?.id ?? data.groups[0].id);
      }
    } catch (err) {
      console.error('Failed to load groups:', err);
    }
  }

  async function loadItems(groupId: number) {
    try {
      const res = await fetch(`/api/footprints/groups/${groupId}/items`, {
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      console.error('Failed to load items:', err);
    }
  }

  async function handleCreateGroup() {
    if (!newGroupName.trim()) return;
    try {
      const res = await fetch('/api/footprints/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newGroupName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || '创建失败');
        return;
      }
      setNewGroupName('');
      setShowNewGroupInput(false);
      await loadGroups();
    } catch {
      alert('创建失败');
    }
  }

  async function handleSetDefault(groupId: number) {
    try {
      await fetch(`/api/footprints/groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_default: true }),
      });
      await loadGroups();
    } catch {
      alert('设置默认失败');
    }
  }

  async function handleRenameGroup(groupId: number) {
    if (!editGroupName.trim()) return;
    try {
      await fetch(`/api/footprints/groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: editGroupName.trim() }),
      });
      setEditingGroupId(null);
      await loadGroups();
    } catch {
      alert('重命名失败');
    }
  }

  async function handleDeleteGroup(groupId: number) {
    if (!confirm('确定删除此分类组及其所有地点？')) return;
    try {
      await fetch(`/api/footprints/groups/${groupId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (selectedGroupId === groupId) {
        setSelectedGroupId(null);
      }
      await loadGroups();
    } catch {
      alert('删除失败');
    }
  }

  async function handleRemoveItem(item: FootprintItem) {
    if (!selectedGroupId) return;
    try {
      await fetch(
        `/api/footprints/groups/${selectedGroupId}/items?item_id=${item.listItemId}`,
        { method: 'DELETE', credentials: 'include' },
      );
      await loadItems(selectedGroupId);
      await loadGroups();
    } catch {
      alert('移除失败');
    }
  }

  async function handleAddToGroup(item: FootprintItem, targetGroupId: number) {
    try {
      const res = await fetch(`/api/footprints/groups/${targetGroupId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ list_item_id: item.listItemId }),
      });
      if (!res.ok) {
        const err = await res.json();
        if (res.status === 409) {
          alert('该地点已在此分类组中');
        } else {
          alert(err.error || '添加失败');
        }
        return;
      }
      setAddToGroupOpen(false);
      setTargetItem(null);
      await loadGroups();
    } catch {
      alert('添加失败');
    }
  }

  function handleItemClick(item: FootprintItem) {
    if (item.lng && item.lat) {
      const lng = parseFloat(item.lng);
      const lat = parseFloat(item.lat);
      setFocusPosition([lng, lat]);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setZoomAndCenter(8, [lng, lat], true);
      }
    }
  }

  function handleContextMenu(e: React.MouseEvent, item: FootprintItem) {
    e.preventDefault();
    setContextMenu({ item, x: e.clientX, y: e.clientY });
  }

  // Close context menu on any click
  useEffect(() => {
    function handleClick() {
      setContextMenu(null);
    }
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  return (
    <div className={styles.root}>
      <div className={styles.split}>
        <div className={styles.mapCol}>
          <PlanMap
            markers={markers}
            focusPosition={focusPosition}
            onMapLoad={handleMapReady}
            autoLoadMarkers={false}
          />
        </div>

        <div className={styles.rightCol}>
          {/* Group tabs */}
          <div className={styles.groupTabs}>
            {groups.map(group => (
              <div
                key={group.id}
                className={`${styles.groupTab} ${selectedGroupId === group.id ? styles.groupTabActive : ''}`}
                onClick={() => setSelectedGroupId(group.id)}
              >
                {group.name}
                {group.isDefault === 1 && <span className={styles.defaultBadge}>默认</span>}
              </div>
            ))}
            <div
              className={styles.groupTabAdd}
              onClick={() => setShowNewGroupInput(true)}
            >
              ＋新建
            </div>
          </div>

          {/* New group input */}
          {showNewGroupInput && (
            <div className={styles.newGroupRow}>
              <input
                className={styles.newGroupInput}
                placeholder="输入分类组名称"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateGroup()}
                autoFocus
              />
              <button className={styles.newGroupConfirm} onClick={handleCreateGroup}>
                确定
              </button>
              <button
                className={styles.newGroupCancel}
                onClick={() => {
                  setShowNewGroupInput(false);
                  setNewGroupName('');
                }}
              >
                取消
              </button>
            </div>
          )}

          {/* Selected group header */}
          {selectedGroup && (
            <div className={styles.groupHeader}>
              {editingGroupId === selectedGroup.id ? (
                <div className={styles.editRow}>
                  <input
                    className={styles.editInput}
                    value={editGroupName}
                    onChange={e => setEditGroupName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleRenameGroup(selectedGroup.id)}
                    autoFocus
                  />
                  <button
                    className={styles.editConfirm}
                    onClick={() => handleRenameGroup(selectedGroup.id)}
                  >
                    保存
                  </button>
                  <button
                    className={styles.editCancel}
                    onClick={() => setEditingGroupId(null)}
                  >
                    取消
                  </button>
                </div>
              ) : (
                <div className={styles.groupTitleRow}>
                  <span className={styles.groupTitle}>{selectedGroup.name}</span>
                  <button
                    className={styles.groupAction}
                    onClick={() => {
                      setEditingGroupId(selectedGroup.id);
                      setEditGroupName(selectedGroup.name);
                    }}
                    title="重命名"
                  >
                    ✏️
                  </button>
                  {selectedGroup.isDefault !== 1 && (
                    <button
                      className={styles.groupAction}
                      onClick={() => handleSetDefault(selectedGroup.id)}
                      title="设为默认"
                    >
                      ⭐
                    </button>
                  )}
                  <button
                    className={styles.groupActionDanger}
                    onClick={() => handleDeleteGroup(selectedGroup.id)}
                    title="删除"
                  >
                    🗑
                  </button>
                </div>
              )}
              <div className={styles.itemCount}>共 {items.length} 个地点</div>
            </div>
          )}

          {/* Item list */}
          <div className={styles.itemList}>
            {items.map(item => (
              <div
                key={item.id}
                className={styles.itemCard}
                onClick={() => handleItemClick(item)}
                onContextMenu={e => handleContextMenu(e, item)}
              >
                {item.coverImage && (
                  <div
                    className={styles.itemCover}
                    style={{ backgroundImage: `url(${item.coverImage})` }}
                  />
                )}
                <div className={styles.itemInfo}>
                  <h3 className={styles.itemTitle}>{item.title}</h3>
                  {item.address && <p className={styles.itemAddress}>{item.address}</p>}
                  {item.listName && (
                    <span className={styles.itemListName}>{item.listName}</span>
                  )}
                </div>
                <button
                  className={styles.itemMenuBtn}
                  onClick={e => {
                    e.stopPropagation();
                    handleContextMenu(e, item);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="3" cy="8" r="1.5" fill="#9ca3af" />
                    <circle cx="8" cy="8" r="1.5" fill="#9ca3af" />
                    <circle cx="13" cy="8" r="1.5" fill="#9ca3af" />
                  </svg>
                </button>
              </div>
            ))}
            {items.length === 0 && selectedGroup && (
              <p className={styles.emptyHint}>暂无地点，在榜单中点击已去即可添加</p>
            )}
            {!selectedGroup && groups.length === 0 && (
              <p className={styles.emptyHint}>暂无分类组，点击上方"+ 新建"创建</p>
            )}
          </div>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className={styles.contextMenuItem}
            onClick={() => {
              setTargetItem(contextMenu.item);
              setAddToGroupOpen(true);
              setContextMenu(null);
            }}
          >
            添加到其他组
          </button>
          <button
            className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
            onClick={() => {
              handleRemoveItem(contextMenu.item);
              setContextMenu(null);
            }}
          >
            从本组移除
          </button>
        </div>
      )}

      {/* Add to group modal */}
      {addToGroupOpen && targetItem && (
        <div className={styles.modalOverlay} onClick={() => { setAddToGroupOpen(false); setTargetItem(null); }}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>
              添加到分类组: {targetItem.title}
            </h3>
            <div className={styles.modalGroupList}>
              {groups
                .filter(g => g.id !== selectedGroupId)
                .map(g => (
                  <button
                    key={g.id}
                    className={styles.modalGroupBtn}
                    onClick={() => handleAddToGroup(targetItem, g.id)}
                  >
                    {g.name}
                    {g.isDefault === 1 && <span className={styles.defaultBadge}>默认</span>}
                  </button>
                ))}
              {groups.filter(g => g.id !== selectedGroupId).length === 0 && (
                <p className={styles.emptyHint}>暂无其他分类组</p>
              )}
            </div>
            <button
              className={styles.modalClose}
              onClick={() => { setAddToGroupOpen(false); setTargetItem(null); }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update CSS for the new right panel**

Replace `src/app/(shell)/footprints/footprints-page.module.css`:

```css
.root {
  width: calc(100% - var(--space-16));
  height: min(calc(100vh - var(--shell-header-offset, 88px) - 32px), 880px);
  min-height: 0;
  padding: 0;
  margin-left: 0;
  box-sizing: border-box;
  background: transparent;
  overflow: hidden;
}

.split {
  display: grid;
  grid-template-columns: minmax(0, 2.8fr) minmax(0, 1.2fr);
  column-gap: var(--space-12);
  row-gap: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  align-items: stretch;
  box-sizing: border-box;
  background: transparent;
}

.mapCol {
  min-width: 0;
  padding: var(--space-16) 0 var(--space-20) 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background: transparent;
  overflow: hidden;
}

.rightCol {
  min-width: 0;
  background: transparent;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  padding: var(--space-16) 0 var(--space-20) var(--space-12);
  box-sizing: border-box;
  min-height: 0;
}

/* Group tabs */
.groupTabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 8px;
  margin-bottom: 8px;
  scroll-snap-type: x mandatory;
  flex-wrap: wrap;
}

.groupTab {
  flex-shrink: 0;
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 16px;
  background: #f3f4f6;
  color: #374151;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 4px;
}

.groupTab:hover {
  background: #e5e7eb;
}

.groupTabActive {
  background: #3b82f6;
  color: #fff;
}

.groupTabAdd {
  flex-shrink: 0;
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 16px;
  background: transparent;
  color: #6b7280;
  border: 1px dashed #d1d5db;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}

.groupTabAdd:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.defaultBadge {
  font-size: 10px;
  background: rgba(255, 255, 255, 0.3);
  padding: 1px 4px;
  border-radius: 4px;
}

/* New group input */
.newGroupRow {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
  align-items: center;
}

.newGroupInput {
  flex: 1;
  padding: 6px 10px;
  font-size: 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  outline: none;
}

.newGroupInput:focus {
  border-color: #3b82f6;
}

.newGroupConfirm {
  padding: 4px 12px;
  font-size: 12px;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.newGroupCancel {
  padding: 4px 12px;
  font-size: 12px;
  background: #f3f4f6;
  color: #374151;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

/* Group header */
.groupHeader {
  padding: 8px 0;
  border-bottom: 1px solid #f3f4f6;
  margin-bottom: 12px;
}

.groupTitleRow {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.groupTitle {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  flex: 1;
}

.groupAction {
  padding: 2px 6px;
  font-size: 14px;
  background: none;
  border: none;
  cursor: pointer;
  border-radius: 4px;
}

.groupAction:hover {
  background: #f3f4f6;
}

.groupActionDanger {
  padding: 2px 6px;
  font-size: 14px;
  background: none;
  border: none;
  cursor: pointer;
  border-radius: 4px;
}

.groupActionDanger:hover {
  background: #fee2e2;
}

.itemCount {
  font-size: 12px;
  color: #9ca3af;
}

/* Edit row */
.editRow {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
}

.editInput {
  flex: 1;
  padding: 4px 8px;
  font-size: 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  outline: none;
}

.editInput:focus {
  border-color: #3b82f6;
}

.editConfirm {
  padding: 4px 10px;
  font-size: 12px;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.editCancel {
  padding: 4px 10px;
  font-size: 12px;
  background: #f3f4f6;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

/* Item list */
.itemList {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Item card */
.itemCard {
  display: flex;
  gap: 8px;
  padding: 8px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  align-items: stretch;
  min-height: 150px;
  position: relative;
  cursor: pointer;
  transition: box-shadow 0.15s;
}

.itemCard:hover {
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.itemCover {
  width: 150px;
  min-height: 150px;
  border-radius: 8px;
  background-size: cover;
  background-position: center;
  background-color: #f3f4f6;
  flex-shrink: 0;
}

.itemInfo {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.itemTitle {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
}

.itemAddress {
  margin: 0 0 4px;
  font-size: 11px;
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.itemListName {
  font-size: 10px;
  color: #3b82f6;
  background: #eff6ff;
  padding: 1px 6px;
  border-radius: 4px;
  align-self: flex-start;
  margin-top: auto;
}

.itemMenuBtn {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  cursor: pointer;
  border-radius: 50%;
  border: none;
  background: none;
  transition: background 0.2s;
}

.itemMenuBtn:hover {
  background: #f3f4f6;
}

.emptyHint {
  font-size: 13px;
  color: #9ca3af;
  text-align: center;
  padding: 24px 0;
}

/* Context menu */
.contextMenu {
  position: fixed;
  z-index: 1000;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  min-width: 140px;
}

.contextMenuItem {
  display: block;
  width: 100%;
  padding: 10px 16px;
  font-size: 13px;
  text-align: left;
  border: none;
  background: none;
  cursor: pointer;
  color: #374151;
}

.contextMenuItem:hover {
  background: #f3f4f6;
}

.contextMenuItemDanger {
  color: #ef4444;
}

.contextMenuItemDanger:hover {
  background: #fee2e2;
}

/* Modal overlay */
.modalOverlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal {
  background: white;
  border-radius: 12px;
  padding: 20px;
  width: 320px;
  max-height: 60vh;
  overflow-y: auto;
}

.modalTitle {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 16px;
  color: #1f2937;
}

.modalGroupList {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.modalGroupBtn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-size: 13px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
  color: #374151;
}

.modalGroupBtn:hover {
  border-color: #3b82f6;
  background: #eff6ff;
}

.modalClose {
  display: block;
  width: 100%;
  padding: 8px;
  font-size: 13px;
  border: none;
  background: #f3f4f6;
  border-radius: 8px;
  cursor: pointer;
  color: #6b7280;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(shell)/footprints/page.tsx src/app/(shell)/footprints/footprints-page.module.css
git commit -m "feat: implement footprints page right panel with group tabs and item cards"
```

---

### Task 8: Leaderboard "已去" Integration

**Files:**
- Modify: `src/app/(shell)/lists/page.tsx`

- [ ] **Step 1: Add footprint default group calls to handleVisited**

In `src/app/(shell)/lists/page.tsx`, modify the `handleVisited` function. Find this section (around line 294):

```typescript
  const handleVisited = async (itemId: number) => {
    const wasVisited = visitedItemIds.has(itemId);
    const newVisited = new Set(visitedItemIds);
```

Add after the existing visitedPlaces PATCH call (after the `try` block around lines 322-346), insert before the closing `}` of handleVisited. The insertion point is inside the existing `handleVisited` try block, right after `PATCH /api/user/lists` but before the catch. Add this code:

```typescript
    // Sync to footprint default group
    try {
      if (!wasVisited) {
        await fetch('/api/footprints/default/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ list_item_id: itemId }),
        });
      } else {
        await fetch(`/api/footprints/default/items?list_item_id=${itemId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
      }
    } catch {}
```

The exact insertion point: right after the existing `PATCH /api/user/lists` success path (around line 346, after the closing `}` of the try-catch for visitedPlaces PATCH), but still inside `handleVisited`.

Full modified `handleVisited` should look like:

```typescript
  const handleVisited = async (itemId: number) => {
    const wasVisited = visitedItemIds.has(itemId);
    const newVisited = new Set(visitedItemIds);
    if (wasVisited) {
      newVisited.delete(itemId);
    } else {
      newVisited.add(itemId);
    }
    setVisitedItemIds(newVisited);

    // If canceling visited, also delete rating from database
    if (wasVisited) {
      const newRatings = new Map(ratings);
      newRatings.delete(itemId);
      setRatings(newRatings);

      try {
        await fetch('/api/ratings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ targetType: 'list_item', targetId: itemId, rating: 0 }),
        });
      } catch (e) {
        console.error('Failed to delete rating:', e);
      }
    }

    try {
      const res = await fetch('/api/user/lists', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ visitedPlaces: Array.from(newVisited).map(id => ({ listItemId: id, addedAt: new Date().toISOString() })) }),
      });
      if (res.status === 401 || res.status === 403) {
        setVisitedItemIds(prev => {
          const rollback = new Set(prev);
          if (wasVisited) rollback.add(itemId);
          else rollback.delete(itemId);
          return rollback;
        });
        alert('请先登录后再标记足迹');
        return;
      }
      if (!res.ok) {
        setVisitedItemIds(prev => {
          const rollback = new Set(prev);
          if (wasVisited) rollback.add(itemId);
          else rollback.delete(itemId);
          return rollback;
        });
      }
    } catch {
      setVisitedItemIds(prev => {
        const rollback = new Set(prev);
        if (wasVisited) rollback.add(itemId);
        else rollback.delete(itemId);
        return rollback;
      });
    }

    // Sync to footprint default group
    try {
      if (!wasVisited) {
        await fetch('/api/footprints/default/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ list_item_id: itemId }),
        });
      } else {
        await fetch(`/api/footprints/default/items?list_item_id=${itemId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
      }
    } catch {}

    // Delete rating when canceling visited
    if (wasVisited) {
      try {
        await fetch('/api/ratings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ targetType: 'list_item', targetId: itemId, rating: 0, comment: '' }),
        });
      } catch {}
    }
  };
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(shell)/lists/page.tsx
git commit -m "feat: sync visited action to footprint default group"
```

---

### Task 9: Admin API - Footprints

**Files:**
- Create: `src/app/api/admin/footprints/route.ts`

- [ ] **Step 1: Create admin footprints API**

```typescript
// src/app/api/admin/footprints/route.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq, sql, desc } from 'drizzle-orm';
import { db } from '@/db';
import { footprintGroups, footprintGroupItems, users } from '@/db/schema';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';

function verifyAdminToken(req: NextRequest): NextResponse | null {
  const token = getAdminTokenFromRequest(req);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const [, timestamp] = decoded.split(':');
    if (!timestamp) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    const age = Date.now() - parseInt(timestamp);
    if (age > 7 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const authError = verifyAdminToken(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get('group_id');

  try {
    if (groupId) {
      // Get items in a group
      const items = await db
        .select()
        .from(footprintGroupItems)
        .where(eq(footprintGroupItems.groupId, parseInt(groupId)))
        .orderBy(desc(footprintGroupItems.id));

      return NextResponse.json({ items });
    }

    // List all groups with user info
    const groups = await db
      .select({
        id: footprintGroups.id,
        userId: footprintGroups.userId,
        userPhone: users.phone,
        userNickname: users.nickname,
        name: footprintGroups.name,
        isDefault: footprintGroups.isDefault,
        itemCount: sql<number>`count(${footprintGroupItems.id})`,
        createdAt: footprintGroups.createdAt,
      })
      .from(footprintGroups)
      .leftJoin(users, eq(footprintGroups.userId, users.id))
      .leftJoin(footprintGroupItems, eq(footprintGroups.id, footprintGroupItems.groupId))
      .groupBy(footprintGroups.id)
      .orderBy(desc(footprintGroups.id));

    return NextResponse.json({ groups });
  } catch (err) {
    console.error('Admin GET /api/admin/footprints error:', err);
    return NextResponse.json({ error: '获取足迹数据失败' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authError = verifyAdminToken(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get('group_id');
  const itemId = searchParams.get('item_id');

  try {
    if (itemId) {
      // Remove item from group
      await db
        .delete(footprintGroupItems)
        .where(eq(footprintGroupItems.id, parseInt(itemId)));
      return NextResponse.json({ success: true });
    }

    if (!groupId) {
      return NextResponse.json({ error: '缺少group_id参数' }, { status: 400 });
    }

    // Delete entire group
    await db.delete(footprintGroups).where(eq(footprintGroups.id, parseInt(groupId)));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Admin DELETE /api/admin/footprints error:', err);
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/admin/footprints/route.ts
git commit -m "feat: add admin API for footprints (list groups, delete)"
```

---

### Task 10: Admin Page - Footprints Management

**Files:**
- Create: `src/app/management/footprints/page.tsx`
- Modify: `src/app/management/layout.tsx` (add nav item)

- [ ] **Step 1: Add nav item to admin layout**

In `src/app/management/layout.tsx`, find the `navItems` array and add after `embed-logs`:

```typescript
  { path: '/management/footprints', icon: '👣', label: '足迹分组' },
```

- [ ] **Step 2: Create admin footprints page**

```typescript
// src/app/management/footprints/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from '../admin-auth';

interface FootprintGroup {
  id: number;
  userId: number;
  userPhone: string;
  userNickname: string | null;
  name: string;
  isDefault: number;
  itemCount: number;
  createdAt: string;
}

interface FootprintItem {
  id: number;
  groupId: number;
  listItemId: number;
  addedAt: string;
}

export default function FootprintsPage() {
  const [groups, setGroups] = useState<FootprintGroup[]>([]);
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null);
  const [expandedItems, setExpandedItems] = useState<FootprintItem[]>([]);
  const { token } = useAdminAuth();

  useEffect(() => {
    loadGroups();
  }, [token]);

  async function loadGroups() {
    try {
      const res = await fetch('/api/admin/footprints', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setGroups(data.groups || []);
    } catch (err) {
      console.error('Failed to load groups:', err);
    }
  }

  async function loadItems(groupId: number) {
    try {
      const res = await fetch(`/api/admin/footprints?group_id=${groupId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setExpandedItems(data.items || []);
    } catch (err) {
      console.error('Failed to load items:', err);
    }
  }

  async function handleDeleteGroup(groupId: number) {
    if (!confirm('确定删除该分类组？这将同时删除组内所有地点关联。')) return;
    try {
      await fetch(`/api/admin/footprints?group_id=${groupId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (expandedGroup === groupId) {
        setExpandedGroup(null);
        setExpandedItems([]);
      }
      loadGroups();
    } catch (err) {
      console.error('Failed to delete group:', err);
    }
  }

  async function handleRemoveItem(itemId: number) {
    if (!confirm('确定从分类组移除该地点？')) return;
    try {
      await fetch(`/api/admin/footprints?item_id=${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (expandedGroup) {
        loadItems(expandedGroup);
      }
      loadGroups();
    } catch (err) {
      console.error('Failed to remove item:', err);
    }
  }

  function handleToggleGroup(groupId: number) {
    if (expandedGroup === groupId) {
      setExpandedGroup(null);
      setExpandedItems([]);
    } else {
      setExpandedGroup(groupId);
      loadItems(groupId);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>足迹分组管理</h1>

      {groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
          暂无足迹数据
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>用户</th>
              <th style={thStyle}>分类组名</th>
              <th style={thStyle}>默认</th>
              <th style={thStyle}>地点数</th>
              <th style={thStyle}>创建时间</th>
              <th style={thStyle}>操作</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(group => (
              <>
                <tr key={group.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={tdStyle}>{group.id}</td>
                  <td style={tdStyle}>
                    {group.userNickname || group.userPhone}
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => handleToggleGroup(group.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontWeight: 500 }}
                    >
                      {expandedGroup === group.id ? '▾ ' : '▸ '}
                      {group.name}
                    </button>
                  </td>
                  <td style={tdStyle}>{group.isDefault === 1 ? '✅' : '—'}</td>
                  <td style={tdStyle}>{group.itemCount}</td>
                  <td style={tdStyle}>{new Date(group.createdAt).toLocaleDateString()}</td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => handleDeleteGroup(group.id)}
                      style={{ padding: '4px 12px', fontSize: 12, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                    >
                      删除
                    </button>
                  </td>
                </tr>
                {expandedGroup === group.id && (
                  <tr key={`items-${group.id}`}>
                    <td colSpan={7} style={{ padding: 16, background: '#f9fafb' }}>
                      {expandedItems.length === 0 ? (
                        <p style={{ color: '#9ca3af', fontSize: 13 }}>暂无地点</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {expandedItems.map(item => (
                            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#fff', borderRadius: 6 }}>
                              <span style={{ fontSize: 13 }}>
                                地点ID: {item.listItemId} | 添加于: {new Date(item.addedAt).toLocaleString()}
                              </span>
                              <button
                                onClick={() => handleRemoveItem(item.id)}
                                style={{ padding: '2px 10px', fontSize: 11, background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer' }}
                              >
                                移除
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 13,
  color: '#374151',
};
```

- [ ] **Step 3: Commit**

```bash
git add src/app/management/footprints/page.tsx src/app/management/layout.tsx
git commit -m "feat: add admin footprints management page"
```

---

### Task 11: Verify with Build

**Files:**
- None (verification only)

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "footprints|schema\.footprints" || echo "No footprint-related errors"
```

Expected: Only pre-existing errors unrelated to footprint changes.

- [ ] **Step 2: Run Next.js build**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build succeeds (may show pre-existing warnings).

- [ ] **Step 3: Final commit (if any fixes needed)**

```bash
git status
```

If clean, no further action needed.

---

### Task 12: Push DB Schema

**Files:**
- None (DB migration)

- [ ] **Step 1: Push schema changes to database**

```bash
npx drizzle-kit push
```

Expected: Tables `footprint_groups` and `footprint_group_items` created.
