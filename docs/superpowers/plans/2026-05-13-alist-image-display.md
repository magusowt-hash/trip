# AList Image Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display cloud storage images for footprint locations via AList, with cover override and album view, zero server storage.

**Architecture:** AListClient service module wraps AList REST API with auth+path isolation. New DB columns on footprint_group_items store cloud_folder/cloud_cover. API routes proxy AList under /api/alist/* with userId-based path prefixing. Frontend album page at /albums/[listItemId] supports grid/list/waterfall views.

**Tech Stack:** Next.js 14 App Router, Drizzle ORM (MySQL), TypeScript, CSS Modules

---

### Task 1: DB Schema — alist_config table + cloud columns

**Files:**
- Create: `src/db/schema.alist.ts`
- Modify: `src/db/schema.footprints.ts` (add columns)
- Modify: `src/db/schema.ts` (export)

- [ ] **Step 1: Create `src/db/schema.alist.ts`**

```typescript
import { mysqlTable, serial, varchar, tinyint, timestamp } from 'drizzle-orm/mysql-core';

export const alistConfig = mysqlTable(
  'alist_config',
  {
    id: serial('id').primaryKey(),
    url: varchar('url', { length: 255 }).notNull(),
    username: varchar('username', { length: 64 }).notNull(),
    password: varchar('password', { length: 128 }).notNull(),
    rootPath: varchar('root_path', { length: 255 }).default('/'),
    enabled: tinyint('enabled').default(0),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
);
```

- [ ] **Step 2: Add columns to `src/db/schema.footprints.ts`**

Add to `footprintGroupItems` after `listItemId`:

```typescript
    cloudFolder: varchar('cloud_folder', { length: 255 }),
    cloudCover: varchar('cloud_cover', { length: 500 }),
```

Also add `text` to imports from drizzle-orm/mysql-core.

- [ ] **Step 3: Export alistConfig from `src/db/schema.ts`**

Append after the footprints export:
```typescript
export { alistConfig } from './schema.alist';
```

- [ ] **Step 4: Push DB**

```bash
npx drizzle-kit push 2>&1 || echo "If push fails, tables may need manual creation"
```

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.alist.ts src/db/schema.footprints.ts src/db/schema.ts
git commit -m "feat: add alist_config table and cloud_cover/cloud_folder columns"
```

---

### Task 2: AListClient Service Module

**Files:**
- Create: `src/services/alist.ts`

- [ ] **Step 1: Create the service**

```typescript
// src/services/alist.ts

interface AlistConfig {
  url: string;
  username: string;
  password: string;
  rootPath: string;
  enabled: boolean;
}

interface AlistFile {
  name: string;
  size: number;
  is_dir: boolean;
  modified: string;
  sign: string;
  thumb: string;
  type: number;
}

let cachedConfig: AlistConfig | null = null;
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getConfig(): Promise<AlistConfig | null> {
  if (cachedConfig) return cachedConfig;
  try {
    const { db } = await import('@/db');
    const { alistConfig } = await import('@/db/schema');
    const [row] = await db.select().from(alistConfig).limit(1);
    if (!row || !row.enabled) return null;
    cachedConfig = {
      url: row.url.replace(/\/$/, ''),
      username: row.username,
      password: row.password,
      rootPath: row.rootPath || '/',
      enabled: true,
    };
    return cachedConfig;
  } catch {
    return null;
  }
}

async function getToken(config: AlistConfig): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const res = await fetch(`${config.url}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: config.username, password: config.password }),
  });
  const data = await res.json();
  if (data.code !== 200) throw new Error('AList login failed: ' + data.message);
  cachedToken = data.data.token;
  tokenExpiry = Date.now() + 3600000;
  return cachedToken;
}

async function alistFetch(config: AlistConfig, path: string, body?: any): Promise<any> {
  const token = await getToken(config);
  const res = await fetch(`${config.url}/api${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function buildUserPath(config: AlistConfig | null, userId: number, subPath: string): string {
  // Sanitize: remove .. and leading slashes
  const safe = subPath.replace(/\.\./g, '').replace(/^\/+/, '');
  const base = config?.rootPath || '/';
  const root = base.endsWith('/') ? base : base + '/';
  return `${root}user_${userId}/${safe}`.replace(/\/+/g, '/');
}

export async function searchFolders(userId: number, name: string): Promise<{ name: string; path: string; file_count: number }[]> {
  const config = await getConfig();
  if (!config) return [];
  const userPath = buildUserPath(config, userId, '');
  const data = await alistFetch(config, `/fs/list?path=${encodeURIComponent(userPath)}&password=`);
  if (data.code !== 200 || !data.data?.content) return [];
  return (data.data.content as AlistFile[])
    .filter(f => f.is_dir && f.name.includes(name))
    .map(f => ({ name: f.name, path: userPath + f.name, file_count: 0 }));
}

export async function listFiles(userId: number, subPath: string): Promise<{ name: string; url: string; thumb: string; size: number }[]> {
  const config = await getConfig();
  if (!config) return [];
  const fullPath = buildUserPath(config, userId, subPath);
  const data = await alistFetch(config, `/fs/list?path=${encodeURIComponent(fullPath)}&password=`);
  if (data.code !== 200 || !data.data?.content) return [];
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  return (data.data.content as AlistFile[])
    .filter(f => !f.is_dir && imageExts.some(ext => f.name.toLowerCase().endsWith(ext)))
    .map(f => ({
      name: f.name,
      url: f.sign ? `${config!.url}/d${fullPath}/${f.name}?sign=${f.sign}` : '',
      thumb: f.thumb ? `${config!.url}/d${fullPath}/${f.name}?sign=${f.thumb}` : '',
      size: f.size,
    }));
}

export async function getFirstImage(userId: number, subPath: string): Promise<string | null> {
  const config = await getConfig();
  if (!config) return null;
  const fullPath = buildUserPath(config, userId, subPath);
  const data = await alistFetch(config, `/fs/list?path=${encodeURIComponent(fullPath)}&password=`);
  if (data.code !== 200 || !data.data?.content) return null;
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  const first = (data.data.content as AlistFile[]).find(
    f => !f.is_dir && imageExts.some(ext => f.name.toLowerCase().endsWith(ext)),
  );
  if (!first || !first.sign) return null;
  return `${config!.url}/d${fullPath}/${first.name}?sign=${first.sign}`;
}

export async function testConnection(): Promise<boolean> {
  cachedConfig = null;
  cachedToken = null;
  const config = await getConfig();
  if (!config) return false;
  try {
    await getToken(config);
    return true;
  } catch {
    return false;
  }
}

export function clearCache() {
  cachedConfig = null;
  cachedToken = null;
  tokenExpiry = 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/alist.ts
git commit -m "feat: add AListClient service module with auth and path isolation"
```

---

### Task 3: API — /api/alist/folders (search + list)

**Files:**
- Create: `src/app/api/alist/folders/route.ts`
- Create: `src/app/api/alist/_auth.ts` (shared auth helper)

- [ ] **Step 1: Create auth helper `src/app/api/alist/_auth.ts`**

```typescript
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { verifyAuthToken, type AuthJwtPayload } from '@/server/auth/jwt';
import { getAuthTokenFromRequest } from '@/server/auth/cookies';

export async function authenticate(req: NextRequest): Promise<{ authorized: false; response: NextResponse } | { authorized: true; userId: number }> {
  const token = getAuthTokenFromRequest(req);
  if (!token) return { authorized: false, response: NextResponse.json({ error: '未登录' }, { status: 401 }) };
  let payload: AuthJwtPayload;
  try { payload = await verifyAuthToken(token); } catch {
    return { authorized: false, response: NextResponse.json({ error: '未登录' }, { status: 401 }) };
  }
  const userId = Number(payload.sub);
  if (!Number.isFinite(userId)) return { authorized: false, response: NextResponse.json({ error: '无效用户' }, { status: 401 }) };
  return { authorized: true, userId };
}
```

- [ ] **Step 2: Create `src/app/api/alist/folders/route.ts`**

```typescript
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { searchFolders, listFiles } from '@/services/alist';
import { authenticate } from '../_auth';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name');
  const path = searchParams.get('path');

  try {
    if (path) {
      const files = await listFiles(auth.userId, path);
      return NextResponse.json({ files });
    }
    if (name) {
      const folders = await searchFolders(auth.userId, name);
      return NextResponse.json({ folders });
    }
    return NextResponse.json({ error: '需要 name 或 path 参数' }, { status: 400 });
  } catch (err) {
    console.error('GET /api/alist/folders error:', err);
    return NextResponse.json({ error: '获取文件列表失败' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/alist/_auth.ts src/app/api/alist/folders/route.ts
git commit -m "feat: add /api/alist/folders endpoint for cloud file listing"
```

---

### Task 4: API — /api/alist/cover + /api/alist/bind

**Files:**
- Create: `src/app/api/alist/cover/route.ts`
- Create: `src/app/api/alist/bind/route.ts`

- [ ] **Step 1: Create `src/app/api/alist/cover/route.ts`**

```typescript
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { footprintGroupItems, listItems } from '@/db/schema';
import { getFirstImage } from '@/services/alist';
import { authenticate } from '../_auth';

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.authorized) return auth.response;

  try {
    const { list_item_id } = (await req.json()) as { list_item_id?: number };
    if (!list_item_id) return NextResponse.json({ error: '缺少list_item_id' }, { status: 400 });

    // Try name-based folder matching
    const [item] = await db.select({ title: listItems.title }).from(listItems).where(eq(listItems.id, list_item_id));
    if (!item) return NextResponse.json({ error: '地点不存在' }, { status: 404 });

    const url = await getFirstImage(auth.userId, item.title);
    if (url) {
      await db.update(footprintGroupItems)
        .set({ cloudCover: url, cloudFolder: item.title })
        .where(eq(footprintGroupItems.listItemId, list_item_id));
    }

    return NextResponse.json({ success: true, cloud_cover: url || null });
  } catch (err) {
    console.error('POST /api/alist/cover error:', err);
    return NextResponse.json({ error: '获取封面失败' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `src/app/api/alist/bind/route.ts`**

```typescript
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { footprintGroupItems, footprintGroups } from '@/db/schema';
import { authenticate } from '../_auth';

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.authorized) return auth.response;

  try {
    const { list_item_id, folder_path } = (await req.json()) as { list_item_id?: number; folder_path?: string };
    if (!list_item_id || !folder_path) return NextResponse.json({ error: '缺少参数' }, { status: 400 });

    const [groupItem] = await db
      .select()
      .from(footprintGroupItems)
      .innerJoin(footprintGroups, eq(footprintGroupItems.groupId, footprintGroups.id))
      .where(and(eq(footprintGroupItems.listItemId, list_item_id), eq(footprintGroups.userId, auth.userId)))
      .limit(1);
    if (!groupItem) return NextResponse.json({ error: '记录不存在' }, { status: 404 });

    await db.update(footprintGroupItems)
      .set({ cloudFolder: folder_path })
      .where(eq(footprintGroupItems.listItemId, list_item_id));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/alist/bind error:', err);
    return NextResponse.json({ error: '绑定失败' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/alist/cover/route.ts src/app/api/alist/bind/route.ts
git commit -m "feat: add /api/alist/cover and /api/alist/bind endpoints"
```

---

### Task 5: API — Admin AList Config + Items cloud fields in response

**Files:**
- Create: `src/app/api/admin/alist/config/route.ts`
- Modify: `src/app/api/footprints/groups/[id]/items/route.ts` (add cloud_cover + cloud_folder to select)

- [ ] **Step 1: Create `src/app/api/admin/alist/config/route.ts`**

```typescript
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { alistConfig } from '@/db/schema';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';
import { clearCache, testConnection } from '@/services/alist';

function verifyAdmin(req: NextRequest): NextResponse | null {
  const token = getAdminTokenFromRequest(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const d = Buffer.from(token, 'base64').toString();
    const [, ts] = d.split(':');
    if (!ts || Date.now() - parseInt(ts) > 7 * 24 * 3600 * 1000) return NextResponse.json({ error: 'Token expired' }, { status: 401 });
  } catch { return NextResponse.json({ error: 'Invalid token' }, { status: 401 }); }
  return null;
}

export async function GET(req: NextRequest) {
  const err = verifyAdmin(req);
  if (err) return err;
  const [row] = await db.select().from(alistConfig).limit(1);
  return NextResponse.json({ config: row || null });
}

export async function PUT(req: NextRequest) {
  const err = verifyAdmin(req);
  if (err) return err;

  const { url, username, password, root_path, enabled } = await req.json();
  const existing = await db.select().from(alistConfig).limit(1);

  const values = {
    url: url || '',
    username: username || '',
    password: password || '',
    rootPath: root_path || '/',
    enabled: enabled ? 1 : 0,
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    await db.update(alistConfig).set(values).where(eq(alistConfig.id, existing[0].id));
  } else {
    await db.insert(alistConfig).values(values);
  }

  clearCache();
  return NextResponse.json({ success: true });
}

export async function POST(req: NextRequest) {
  const err = verifyAdmin(req);
  if (err) return err;
  const ok = await testConnection();
  return NextResponse.json({ connected: ok });
}
```

- [ ] **Step 2: Add cloud_cover/cloud_folder to items GET response**

In `src/app/api/footprints/groups/[id]/items/route.ts`, in the GET handler's select, add:
```typescript
        cloudCover: footprintGroupItems.cloudCover,
        cloudFolder: footprintGroupItems.cloudFolder,
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/alist/config/route.ts src/app/api/footprints/groups/\[id\]/items/route.ts
git commit -m "feat: add admin alist config API and cloud fields to items response"
```

---

### Task 6: Album Page

**Files:**
- Create: `src/app/(shell)/albums/[listItemId]/page.tsx`
- Create: `src/app/(shell)/albums/[listItemId]/album.module.css`

- [ ] **Step 1: Create `src/app/(shell)/albums/[listItemId]/page.tsx`**

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import styles from './album.module.css';

type ViewMode = 'grid' | 'list' | 'waterfall';

interface AlistFile {
  name: string;
  url: string;
  thumb: string;
  size: number;
}

export default function AlbumPage() {
  const params = useParams();
  const router = useRouter();
  const listItemId = params.listItemId as string;
  const [files, setFiles] = useState<AlistFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('grid');
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [cloudFolder, setCloudFolder] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [listItemId]);

  async function loadData() {
    setLoading(true);
    try {
      // First get cloud_folder for this item
      const groupRes = await fetch('/api/footprints/groups', { credentials: 'include' });
      const groupData = await groupRes.json();
      for (const g of groupData.groups || []) {
        const itemRes = await fetch(`/api/footprints/groups/${g.id}/items`, { credentials: 'include' });
        const itemData = await itemRes.json();
        const found = (itemData.items || []).find((i: any) => i.listItemId === parseInt(listItemId));
        if (found) {
          setTitle(found.title || '相册');
          setCloudFolder(found.cloudFolder || found.listName || found.title);
          break;
        }
      }

      const folderPath = cloudFolder || title;
      if (folderPath) {
        const res = await fetch(`/api/alist/folders?path=${encodeURIComponent(folderPath)}`, { credentials: 'include' });
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch (err) {
      console.error('Failed to load album:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (lightbox === null) return;
      if (e.key === 'ArrowRight' && lightbox < files.length - 1) setLightbox(lightbox + 1);
      if (e.key === 'ArrowLeft' && lightbox > 0) setLightbox(lightbox - 1);
      if (e.key === 'Escape') setLightbox(null);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [lightbox, files.length]);

  function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.back()}>← 返回</button>
        <h1 className={styles.topTitle}>{title} · 相册</h1>
        <div className={styles.viewSwitcher}>
          <button className={`${styles.viewBtn} ${view === 'grid' ? styles.viewBtnActive : ''}`} onClick={() => setView('grid')} title="网格">🗔</button>
          <button className={`${styles.viewBtn} ${view === 'list' ? styles.viewBtnActive : ''}`} onClick={() => setView('list')} title="列表">▦</button>
          <button className={`${styles.viewBtn} ${view === 'waterfall' ? styles.viewBtnActive : ''}`} onClick={() => setView('waterfall')} title="瀑布流">▤</button>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>加载中...</div>
      ) : files.length === 0 ? (
        <div className={styles.empty}>暂无云端图片</div>
      ) : (
        <div className={view === 'grid' ? styles.grid : view === 'list' ? styles.list : styles.waterfall}>
          {files.map((file, i) => (
            <div
              key={i}
              className={view === 'grid' ? styles.gridItem : view === 'list' ? styles.listItem : styles.waterfallItem}
              onClick={() => view !== 'list' && setLightbox(i)}
              style={view === 'waterfall' ? { height: 160 + (i % 3) * 60 } : undefined}
            >
              <img src={file.thumb || file.url} alt={file.name} loading="lazy" />
              {view === 'list' && (
                <div className={styles.listInfo}>
                  <div className={styles.listName}>{file.name}</div>
                  <div className={styles.listMeta}>{formatSize(file.size)}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {lightbox !== null && (
        <div className={styles.lightbox} onClick={() => setLightbox(null)}>
          <button className={styles.lbPrev} onClick={e => { e.stopPropagation(); if (lightbox > 0) setLightbox(lightbox - 1); }}>‹</button>
          <img src={files[lightbox].url} alt={files[lightbox].name} onClick={e => e.stopPropagation()} />
          <button className={styles.lbNext} onClick={e => { e.stopPropagation(); if (lightbox < files.length - 1) setLightbox(lightbox + 1); }}>›</button>
          <div className={styles.lbCounter}>{lightbox + 1} / {files.length}</div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/(shell)/albums/[listItemId]/album.module.css`**

```css
.root { height: min(calc(100vh - var(--shell-header-offset, 88px) - 32px), 880px); display: flex; flex-direction: column; padding: 16px; overflow: hidden; }
.topBar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-shrink: 0; }
.backBtn { padding: 6px 12px; font-size: 13px; background: #f3f4f6; border: none; border-radius: 6px; cursor: pointer; color: #374151; }
.backBtn:hover { background: #e5e7eb; }
.topTitle { flex: 1; font-size: 18px; font-weight: 600; margin: 0; }
.viewSwitcher { display: flex; gap: 4px; }
.viewBtn { padding: 6px 10px; font-size: 16px; border: 1px solid #e5e7eb; border-radius: 6px; background: #fff; cursor: pointer; }
.viewBtn:hover { background: #f3f4f6; }
.viewBtnActive { background: #3b82f6; color: #fff; border-color: #3b82f6; }

.loading, .empty { flex: 1; display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 15px; }

/* Grid view */
.grid { flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; align-content: start; }
.gridItem { cursor: pointer; aspect-ratio: 1; overflow: hidden; border-radius: 8px; background: #f3f4f6; }
.gridItem img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s; }
.gridItem:hover img { transform: scale(1.05); }

/* List view */
.list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.listItem { display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: 6px; cursor: pointer; }
.listItem:hover { background: #f9fafb; }
.listItem img { width: 48px; height: 48px; object-fit: cover; border-radius: 4px; }
.listInfo { flex: 1; min-width: 0; }
.listName { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.listMeta { font-size: 11px; color: #9ca3af; margin-top: 2px; }

/* Waterfall view */
.waterfall { flex: 1; overflow-y: auto; column-count: 3; column-gap: 8px; }
.waterfallItem { break-inside: avoid; margin-bottom: 8px; border-radius: 8px; overflow: hidden; cursor: pointer; background: #f3f4f6; }
.waterfallItem img { width: 100%; display: block; object-fit: cover; min-height: 120px; }

/* Lightbox */
.lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 3000; display: flex; align-items: center; justify-content: center; }
.lightbox img { max-width: 90vw; max-height: 85vh; object-fit: contain; }
.lbPrev, .lbNext { position: absolute; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.15); border: none; color: #fff; font-size: 40px; width: 56px; height: 56px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.lbPrev:hover, .lbNext:hover { background: rgba(255,255,255,0.3); }
.lbPrev { left: 20px; }
.lbNext { right: 20px; }
.lbCounter { position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); color: #fff; font-size: 14px; background: rgba(0,0,0,0.5); padding: 4px 14px; border-radius: 12px; }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(shell\)/albums/\[listItemId\]/page.tsx src/app/\(shell\)/albums/\[listItemId\]/album.module.css
git commit -m "feat: add album page with grid/list/waterfall views and lightbox"
```

---

### Task 7: User Footprints Page — cover override + album button

**Files:**
- Modify: `src/app/(shell)/user/footprints/page.tsx`

- [ ] **Step 1: Update FootprintItem interface and cover display**

Add to the `FootprintItem` interface:
```typescript
  cloudCover: string | null;
  cloudFolder: string | null;
```

- [ ] **Step 2: Change cover image to prefer cloud_cover**

Replace the cover image div in the item card (the `<div className={styles.itemCover} ...>` block) with:

```typescript
{((item.cloudCover || item.coverImage) && (
  <div className={styles.itemCover} style={{ backgroundImage: `url(${item.cloudCover || item.coverImage})` }} />
))}
```

- [ ] **Step 3: Add album button to context menu**

In the context menu div, add a new button BEFORE "添加到其他组":

```typescript
<button
  className={styles.contextItem}
  onClick={() => {
    router.push(`/albums/${contextMenu.item.listItemId}`);
    setContextMenu(null);
  }}
>
  相册
</button>
```

Add `import { useRouter } from 'next/navigation';` and `const router = useRouter();`.

- [ ] **Step 4: Also add album button to the item card directly (optional)**

After the item menu button, add an album icon for items that have cloud_folder:

```typescript
{item.cloudFolder && (
  <button
    className={styles.itemAlbumBtn}
    onClick={e => { e.stopPropagation(); router.push(`/albums/${item.listItemId}`); }}
    title="相册"
  >
    🖼
  </button>
)}
```

With CSS:
```css
.itemAlbumBtn {
  position: absolute;
  bottom: 40px;
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
  font-size: 14px;
}
.itemAlbumBtn:hover { background: #f3f4f6; }
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(shell\)/user/footprints/page.tsx src/app/\(shell\)/user/footprints/footprints.module.css
git commit -m "feat: cloud cover override and album button in user footprints"
```

---

### Task 8: Lists Page — Auto cover fetch on visited

**Files:**
- Modify: `src/app/(shell)/lists/page.tsx`

- [ ] **Step 1: Add cover fetch after footprint default group POST**

In `handleVisited`, after the `POST /api/footprints/default/items` call, add:

```typescript
    // Try to fetch cloud cover
    try {
      await fetch('/api/alist/cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ list_item_id: itemId }),
      });
    } catch {}
```

Insert this right after the `POST /api/footprints/default/items` block's `catch {}`.

- [ ] **Step 2: Commit**

```bash
git add src/app/\(shell\)/lists/page.tsx
git commit -m "feat: auto-fetch cloud cover on visited action"
```

---

### Task 9: Admin Page + Nav

**Files:**
- Create: `src/app/management/alist/page.tsx`
- Modify: `src/app/management/layout.tsx`

- [ ] **Step 1: Add nav item to layout**

In `src/app/management/layout.tsx` navItems, add:
```typescript
  { path: '/management/alist', icon: '☁️', label: '网盘配置' },
```

- [ ] **Step 2: Create `src/app/management/alist/page.tsx`**

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from '../admin-auth';

export default function AlistConfigPage() {
  const { token } = useAdminAuth();
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rootPath, setRootPath] = useState('/');
  const [enabled, setEnabled] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/admin/alist/config', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        if (data.config) {
          setUrl(data.config.url || '');
          setUsername(data.config.username || '');
          setPassword('');
          setRootPath(data.config.rootPath || '/');
          setEnabled(data.config.enabled === 1);
        }
      });
  }, [token]);

  async function handleSave() {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/alist/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url, username, password: password || undefined, root_path: rootPath, enabled }),
      });
      const data = await res.json();
      setMessage(data.success ? '保存成功' : '保存失败');
    } catch { setMessage('保存失败'); }
    finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/alist/config', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setTestResult(data.connected);
    } catch { setTestResult(false); }
    finally { setTesting(false); }
  }

  const fieldStyle: React.CSSProperties = { padding: '10px 14px', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 8, outline: 'none', width: '100%', boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block' };

  return (
    <div style={{ maxWidth: 500 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>网盘配置</h1>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>AList 地址</label>
        <input style={fieldStyle} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://alist.example.com" />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>用户名</label>
        <input style={fieldStyle} value={username} onChange={e => setUsername(e.target.value)} placeholder="admin" />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>密码</label>
        <input style={fieldStyle} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={password ? '' : '不填则不修改'} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>根路径</label>
        <input style={fieldStyle} value={rootPath} onChange={e => setRootPath(e.target.value)} placeholder="/" />
      </div>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" id="enabled" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
        <label htmlFor="enabled" style={{ fontSize: 14 }}>启用</label>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={handleSave} disabled={saving}
          style={{ padding: '10px 24px', fontSize: 14, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          {saving ? '保存中...' : '保存'}
        </button>
        <button onClick={handleTest} disabled={testing}
          style={{ padding: '10px 24px', fontSize: 14, background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          {testing ? '测试中...' : '测试连接'}
        </button>
      </div>

      {testResult !== null && (
        <div style={{ padding: 12, borderRadius: 8, background: testResult ? '#ecfdf5' : '#fef2f2', color: testResult ? '#059669' : '#ef4444', fontSize: 14 }}>
          {testResult ? '✅ 连接成功' : '❌ 连接失败，请检查配置'}
        </div>
      )}
      {message && (
        <div style={{ marginTop: 8, padding: 8, borderRadius: 6, background: '#f3f4f6', color: '#374151', fontSize: 13 }}>{message}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/management/alist/page.tsx src/app/management/layout.tsx
git commit -m "feat: add admin alist config page and nav item"
```

---

### Task 10: Push DB Schema + Verify Build

- [ ] **Step 1: Push DB**

```bash
npx drizzle-kit push 2>&1 || echo "Manual DB migration needed for alist_config and new columns"
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "alist|album|cloud_cover|cloud_folder" || echo "No alist-related errors"
```

- [ ] **Step 3: Final commit if needed**

```bash
git status
```
