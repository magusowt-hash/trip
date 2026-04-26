# 榜单详情弹窗完善实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完善榜单页面地图标注点的数据组详情弹窗，添加位置、简介、网络图片、评论功能，并将评分与评价整合到点击"已去"后弹出的评分小窗口中。

**Architecture:** 在现有 list_items 表添加 intro 和 imageUrl 字段，更新前后端接口，后台管理添加字段编辑，前端弹窗显示实际数据并添加评分弹窗。

**Tech Stack:** Next.js App Router, Drizzle ORM, React

---

### Task 1: 更新数据库 Schema

**Files:**
- Modify: `src/db/schema.ts:294-311`

- [ ] **Step 1: 添加 intro 和 imageUrl 字段到 listItems 表**

在 listItems 定义中添加两个新字段：

```typescript
// List items table (榜单项)
export const listItems = mysqlTable(
  'list_items',
  {
    id: serial('id').primaryKey(),
    listId: int('list_id').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    coverImage: text('cover_image'),
    description: text('description'),
    intro: text('intro'),           // 新增：简介
    imageUrl: text('image_url'),     // 新增：网络图片URL
    lng: varchar('lng', { length: 20 }),
    lat: varchar('lat', { length: 20 }),
    address: varchar('address', { length: 500 }),
    orderNum: int('order_num').default(0),
    status: tinyint('status').default(1),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
);
```

- [ ] **Step 2: 提交变更**

```bash
git add src/db/schema.ts
git commit -m "feat: add intro and imageUrl fields to list_items table"
```

---

### Task 2: 更新后端 API - GET /api/lists

**Files:**
- Modify: `src/app/api/lists/route.ts:41-51`

- [ ] **Step 1: 更新返回数据包含 intro 和 imageUrl**

修改 items 映射部分：

```typescript
items = items.map(item => ({
  id: item.id,
  list_id: item.listId,
  title: item.title,
  cover_image: item.coverImage,
  description: item.description,
  intro: item.intro,           // 新增
  image_url: item.imageUrl,    // 新增
  lng: item.lng,
  lat: item.lat,
  address: item.address,
  order_num: item.orderNum,
}));
```

- [ ] **Step 2: 提交变更**

```bash
git add src/app/api/lists/route.ts
git commit -m "feat: include intro and image_url in list items API response"
```

---

### Task 3: 更新后台管理 API - PUT /api/admin/list_items

**Files:**
- Modify: `src/app/api/admin/list_items/route.ts:102-108`

- [ ] **Step 1: 支持更新 intro 和 imageUrl**

修改 PUT 方法中的 cover_image 处理逻辑：

```typescript
const { cover_image, intro, image_url, ...rest } = body;
const updateData: any = { ...rest, updatedAt: new Date() };
if (cover_image !== undefined) {
  updateData.coverImage = cover_image;
}
if (intro !== undefined) {
  updateData.intro = intro;
}
if (image_url !== undefined) {
  updateData.imageUrl = image_url;
}
delete updateData.id;
```

- [ ] **Step 2: 提交变更**

```bash
git add src/app/api/admin/list_items/route.ts
git commit -m "feat: support updating intro and image_url in admin list_items API"
```

---

### Task 4: 更新后台管理页面 - 榜单项编辑表单

**Files:**
- Modify: `src/app/management/lists/[id]/page.tsx:35, 484-493, 690-691`

- [ ] **Step 1: 更新 itemForms 类型定义**

在第35行附近找到 itemForms 类型定义，添加 intro 和 image_url 字段：

```typescript
const [itemForms, setItemForms] = useState<Record<number, { title: string; cover_image: string; description: string; lng: string; lat: string; intro: string; image_url: string }>>({});
```

- [ ] **Step 2: 更新 startEdit 函数中初始化数据**

在 startEdit 函数（约484行）中添加新字段：

```typescript
const startEdit = (item: any) => {
  setEditingItemId(item.id);
  setItemForms(prev => ({ ...prev, [item.id]: {
    title: item.title,
    cover_image: item.cover_image,
    description: item.description,
    lng: item.lng,
    lat: item.lat,
    intro: item.intro || '',        // 新增
    image_url: item.image_url || '', // 新增
  } }));
};
```

- [ ] **Step 3: 在编辑表单中添加 intro 和 image_url 输入框**

在 item-fields 区域的 textarea（description）后面添加：

```typescript
<textarea value={itemForms[item.id]?.intro || ''} onChange={e => setItemForms(p => ({ ...p, [item.id]: {...p[item.id], intro: e.target.value }}))} placeholder="简介" rows={2} />
<div className="image-url-input" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
  <input value={itemForms[item.id]?.image_url || ''} onChange={e => setItemForms(p => ({ ...p, [item.id]: {...p[item.id], image_url: e.target.value }}))} placeholder="网络图片URL" style={{ flex: 1 }} />
  {itemForms[item.id]?.image_url && (
    <img src={itemForms[item.id].image_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />
  )}
</div>
```

- [ ] **Step 4: 提交变更**

```bash
git add src/app/management/lists/\[id\]/page.tsx
git commit -m "feat: add intro and image_url fields to list item editor in admin"
```

---

### Task 5: 更新榜单详情弹窗组件

**Files:**
- Modify: `src/modules/lists/ListDetailModal/index.tsx`

- [ ] **Step 1: 更新 Props 类型定义**

添加 intro 和 image_url 到 item 类型：

```typescript
export interface ListDetailModalProps {
  open: boolean;
  onClose: () => void;
  item: {
    id: number;
    title: string;
    coverImage?: string | null;
    description?: string | null;
    intro?: string | null;           // 新增
    image_url?: string | null;      // 新增
    lng?: string | null;
    lat?: string | null;
    address?: string | null;
  };
  favorited?: boolean;
  visited?: boolean;
  rating?: number;
  comment?: string;
  onFavoriteClick?: () => void;
  onVisitedClick?: () => void;
  onRatingChange?: (rating: number, comment: string) => void;
}
```

- [ ] **Step 2: 添加评分弹窗状态**

在组件内添加状态：

```typescript
const [showRatingModal, setShowRatingModal] = useState(false);
const [tempRating, setTempRating] = useState(rating);
const [tempComment, setTempComment] = useState(comment || '');
```

- [ ] **Step 3: 更新简介字段显示**

找到"简介"部分，修改为显示实际数据：

```typescript
<div style={s.section}>
  <div style={s.sectionLabel}>简介</div>
  <div style={s.sectionValue}>
    {item.intro ? (
      <span style={{ color: '#111827' }}>{item.intro}</span>
    ) : (
      <span style={s.placeholderText}>（暂无简介）</span>
    )}
  </div>
</div>
```

- [ ] **Step 4: 更新网络图片字段显示**

找到"网络图片"部分，添加可点击预览功能：

```typescript
const [showImagePreview, setShowImagePreview] = useState(false);

<div style={s.section}>
  <div style={s.sectionLabel}>网络图片</div>
  <div style={s.sectionValue}>
    {item.image_url ? (
      <div 
        style={{ cursor: 'pointer', position: 'relative' }}
        onClick={() => setShowImagePreview(true)}
      >
        <img 
          src={item.image_url} 
          alt="网络图片" 
          style={{ maxWidth: '100%', maxHeight: 150, borderRadius: 6, objectFit: 'cover' }} 
        />
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>点击查看大图</div>
      </div>
    ) : (
      <span style={s.placeholderText}>（暂无网络图片）</span>
    )}
  </div>
</div>
```

- [ ] **Step 5: 添加网络图片预览弹窗**

在组件 return 前添加预览弹窗：

```typescript
{showImagePreview && item.image_url && (
  <div 
    style={{ 
      position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.8)', 
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 
    }}
    onClick={() => setShowImagePreview(false)}
  >
    <img 
      src={item.image_url} 
      alt="预览" 
      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
    />
    <button 
      onClick={() => setShowImagePreview(false)}
      style={{
        position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.2)',
        color: '#fff', border: 'none', borderRadius: '50%', width: 40, height: 40,
        fontSize: 20, cursor: 'pointer'
      }}
    >
      ×
    </button>
  </div>
)}
```

- [ ] **Step 6: 修改"已去"按钮点击行为**

将"已去"按钮的点击改为弹出评分弹窗：

```typescript
const handleVisitedClick = () => {
  setTempRating(localRating);
  setTempComment(localComment || '');
  setShowRatingModal(true);
};
```

将按钮 onClick 改为 handleVisitedClick：

```typescript
<button
  type="button"
  onClick={handleVisitedClick}
  style={{
    ...s.visitedBtn,
    ...(localVisited ? s.visitedBtnActive : {}),
  }}
>
  {localVisited ? '✓' : '○'} 已去
</button>
```

- [ ] **Step 7: 添加评分弹窗组件**

在网络图片 section 之后、scrollContent 结束前添加：

```typescript
{showRatingModal && (
  <div 
    style={{
      position: 'fixed', inset: 0, zIndex: 140, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }}
    onClick={(e) => {
      if (e.target === e.currentTarget) setShowRatingModal(false);
    }}
  >
    <div 
      style={{
        background: '#fff', borderRadius: 12, padding: 20, width: 'min(360px, 90vw)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)'
      }}
    >
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, textAlign: 'center' }}>
        评分与评价
      </h3>
      
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>评分</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 3, 4, 5].map(i => (
            <span
              key={i}
              style={{ fontSize: 24, cursor: 'pointer', color: i * 2 <= tempRating ? '#fbbf24' : '#d1d5db' }}
              onClick={() => setTempRating(i * 2)}
            >
              ★
            </span>
          ))}
        </div>
      </div>
      
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>评价</div>
        <textarea
          value={tempComment}
          onChange={(e) => setTempComment(e.target.value)}
          placeholder="写写你的评价..."
          rows={3}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            border: '1px solid #d1d5db', fontSize: 14, resize: 'vertical',
            boxSizing: 'border-box', fontFamily: 'inherit'
          }}
        />
      </div>
      
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button
          onClick={() => setShowRatingModal(false)}
          style={{
            padding: '10px 20px', borderRadius: 8, border: '1px solid #d1d5db',
            background: '#fff', fontSize: 14, cursor: 'pointer'
          }}
        >
          取消
        </button>
        <button
          onClick={() => {
            setLocalRating(tempRating);
            setLocalComment(tempComment);
            setLocalVisited(true);
            onVisitedClick?.();
            onRatingChange?.(tempRating, tempComment);
            setShowRatingModal(false);
          }}
          style={{
            padding: '10px 20px', borderRadius: 8, border: 'none',
            background: '#3b82f6', color: '#fff', fontSize: 14, cursor: 'pointer'
          }}
        >
          确定
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 8: 提交变更**

```bash
git add src/modules/lists/ListDetailModal/index.tsx
git commit -m "feat: enhance list detail modal with intro, image_url and rating popup"
```

---

### Task 6: 更新榜单页面 - 传递完整数据

**Files:**
- Modify: `src/app/(shell)/lists/page.tsx:8-18, 110-120, 319-332`

- [ ] **Step 1: 更新 ListItem 接口添加新字段**

```typescript
interface ListItem {
  id: number;
  list_id: number;
  title: string;
  cover_image: string | null;
  description: string | null;
  intro: string | null;       // 新增
  image_url: string | null;   // 新增
  lng: string | null;
  lat: string | null;
  address: string | null;
  order_num: number;
}
```

- [ ] **Step 2: 更新 mapMarkers 构建逻辑包含 intro 和 image_url**

```typescript
const markers = items
  .filter(item => item.lng && item.lat)
  .map(item => ({
    id: item.id,
    position: [parseFloat(item.lng!), parseFloat(item.lat!)] as [number, number],
    title: item.title,
    address: item.address || undefined,
    description: item.description || undefined,
    intro: item.intro || undefined,
    image_url: item.image_url || undefined,
  }));
```

- [ ] **Step 3: 更新传递给 ListDetailModal 的 item 数据**

需要确保传入完整的 item 对象：

```typescript
<ListDetailModal
  open={!!modalItem}
  onClose={() => setModalItem(null)}
  item={{
    id: modalItem.id,
    title: modalItem.title,
    coverImage: modalItem.cover_image,
    description: modalItem.description,
    intro: modalItem.intro,
    image_url: modalItem.image_url,
    lng: modalItem.lng,
    lat: modalItem.lat,
    address: modalItem.address,
  }}
  favorited={favoriteItemIds.has(modalItem.id)}
  visited={visitedItemIds.has(modalItem.id)}
  rating={ratings.get(modalItem.id)?.rating || 0}
  comment={ratings.get(modalItem.id)?.comment || ''}
  onFavoriteClick={() => handleFavorite(modalItem.id)}
  onVisitedClick={() => handleVisited(modalItem.id)}
  onRatingChange={(rating, comment) => handleRatingChange(modalItem.id, rating, comment)}
/>
```

- [ ] **Step 4: 提交变更**

```bash
git add src/app/\(shell\)/lists/page.tsx
git commit -m "feat: pass complete item data to list detail modal"
```

---

### Task 7: 验证功能

- [ ] **Step 1: 启动开发服务器**

```bash
npm run dev
```

- [ ] **Step 2: 访问后台管理页面编辑榜单项**

访问 `/management/lists`，选择一个榜单，编辑某个项，填写简介和网络图片URL，保存成功。

- [ ] **Step 3: 访问榜单页面测试弹窗**

访问 `/lists`，点击某个列表项，验证：
- 位置显示地址
- 简介显示 intro 字段
- 网络图片显示 image_url，点击可放大
- 点击"已去"弹出评分弹窗，包含取消和确定按钮

- [ ] **Step 8: 提交最终变更**

```bash
git add .
git commit -m "feat: complete list detail modal enhancement"
```

---

## 完成检查

- [x] Task 1: 数据库 Schema 更新
- [x] Task 2: 后端 API GET 更新
- [x] Task 3: 后台管理 API PUT 更新
- [x] Task 4: 后台管理页面更新
- [x] Task 5: 弹窗组件更新
- [x] Task 6: 榜单页面更新
- [x] Task 7: 功能验证