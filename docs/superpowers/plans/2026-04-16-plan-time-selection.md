# 计划时间选择功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为「制定计划」模块添加时间选择功能：在大交通Tab的首尾选择整体时间段，在每条交通选择上再做时间段选择，最终在「我的计划」列表中正确显示时间段

**Architecture:** 在现有 plans 和 transport_items 表添加日期字段，使用 Day.js UI 实现日历选择器，前端通过 API 传递和显示时间段

**Tech Stack:** MySQL + Drizzle ORM, Next.js API Routes, Day.js UI (React DatePicker)

---

## 文件结构

- **数据库**: 执行 ALTER TABLE 添加 start_date, end_date 字段
- **Schema**: `src/db/schema.ts` - 添加字段定义
- **API**: 
  - `src/app/api/plans/route.ts` - GET/POST/PUT 路由
  - `src/app/api/plans/[id]/route.ts` - GET 详情路由
- **前端**:
  - `src/app/(shell)/plan/page.tsx` - 主页面，添加日期选择器组件
  - `src/app/(shell)/plan/plan-page.module.css` - 样式

---

## 实施任务

### Task 1: 数据库添加字段

**Files:**
- 数据库: 手动执行 SQL

- [ ] **Step 1: 为 plans 表添加日期字段**

```sql
ALTER TABLE plans ADD COLUMN start_date DATE;
ALTER TABLE plans ADD COLUMN end_date DATE;
```

- [ ] **Step 2: 为 transport_items 表添加日期字段**

```sql
ALTER TABLE transport_items ADD COLUMN start_date DATE;
ALTER TABLE transport_items ADD COLUMN end_date DATE;
```

- [ ] **Step 3: 提交更改**

```bash
git add -A
git commit -m "feat: add date fields to plans and transport_items tables"
```

---

### Task 2: 更新 Drizzle Schema

**Files:**
- Modify: `src/db/schema.ts:120-152`

- [ ] **Step 1: 更新 plans 表 schema**

在 schema.ts 中为 plans 表添加：
```typescript
startDate: date('start_date'),
endDate: date('end_date'),
```

- [ ] **Step 2: 更新 transport_items 表 schema**

在 schema.ts 中为 transport_items 表添加：
```typescript
startDate: date('start_date'),
endDate: date('end_date'),
```

- [ ] **Step 3: 提交更改**

```bash
git add src/db/schema.ts
git commit -m "feat: update schema with date fields"
```

---

### Task 3: 更新 GET /api/plans API

**Files:**
- Modify: `src/app/api/plans/route.ts:7-14`

- [ ] **Step 1: 更新 GET 路由返回时间段**

将 plans 表的 start_date 和 end_date 字段添加到返回数据中：
```typescript
const userPlans = await db.select({
  id: plans.id,
  name: plans.name,
  startDate: plans.startDate,
  endDate: plans.endDate,
  createdAt: plans.createdAt,
  updatedAt: plans.updatedAt,
}).from(plans).orderBy(desc(plans.updatedAt));
```

- [ ] **Step 2: 提交更改**

```bash
git add src/app/api/plans/route.ts
git commit -m "feat: GET /api/plans return date fields"
```

---

### Task 4: 更新 POST /api/plans API

**Files:**
- Modify: `src/app/api/plans/route.ts:17-53`

- [ ] **Step 1: 更新 POST 处理 start_date 和 end_date**

在 body 中解构 startDate 和 endDate：
```typescript
const { name, items = [], activeTab = 0, startDate, endDate } = body;
```

- [ ] **Step 2: 更新 INSERT 语句**

```typescript
await db.execute(
  `INSERT INTO plans (user_id, name, active_tab, start_date, end_date, created_at, updated_at) 
   VALUES (1, '${name}', ${activeTab}, ${startDate ? `'${startDate}'` : 'NULL'}, ${endDate ? `'${endDate}'` : 'NULL'}, NOW(), NOW())`
);
```

- [ ] **Step 3: 提交更改**

```bash
git add src/app/api/plans/route.ts
git commit -m "feat: POST /api/plans save date fields"
```

---

### Task 5: 更新 PUT /api/plans API

**Files:**
- Modify: `src/app/api/plans/route.ts:55-89`

- [ ] **Step 1: 更新 PUT 处理时间段**

在 body 中解构 startDate 和 endDate，并更新 UPDATE 语句：
```typescript
const { id, name, items = [], activeTab = 0, startDate, endDate } = body;

// Update plan
await db.execute(
  `UPDATE plans SET name = '${name}', active_tab = ${activeTab}, start_date = ${startDate ? `'${startDate}'` : 'NULL'}, end_date = ${endDate ? `'${endDate}'` : 'NULL'}, updated_at = NOW() WHERE id = ${id}`
);
```

- [ ] **Step 2: 提交更改**

```bash
git add src/app/api/plans/route.ts
git commit -m "feat: PUT /api/plans update date fields"
```

---

### Task 6: 更新 GET /api/plans/[id] API

**Files:**
- Modify: `src/app/api/plans/[id]/route.ts`

- [ ] **Step 1: 读取并返回计划详情和交通项时间段**

确保返回 plan 的 start_date、end_date 以及 transport_items 的 start_date、end_date

- [ ] **Step 2: 提交更改**

```bash
git add src/app/api/plans/\[id\]/route.ts
git commit -m "feat: GET /api/plans/[id] return date fields"
```

---

### Task 7: 安装 Day.js UI 依赖

**Files:**
- 项目根目录: package.json

- [ ] **Step 1: 安装 dayjs 和 react-day-picker**

```bash
npm install dayjs react-day-picker
# 或
npm install dayjs @mui/x-date-pickers @mui/material @emotion/react @emotion/styled
```

根据项目现有依赖选择合适的日历库。如果使用 MUI，需要同时安装相关依赖。

- [ ] **Step 2: 提交更改**

```bash
git add package.json package-lock.json
git commit -m "feat: add date picker dependencies"
```

---

### Task 8: 添加日期选择器组件样式

**Files:**
- Modify: `src/app/(shell)/plan/plan-page.module.css`

- [ ] **Step 1: 添加日期选择器样式**

```css
/* 日期选择器区域 */
.dateRangePicker {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  margin-top: 16px;
}

.dateInput {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  background: #fff;
  text-align: center;
}

.dateInput:focus {
  outline: none;
  border-color: #2563eb;
}

.dateSeparator {
  color: #9ca3af;
  font-size: 14px;
}

/* 交通项日期显示 */
.transportDate {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #8a7f74;
  margin-left: 8px;
  cursor: pointer;
}

.transportDateInput {
  font-size: 12px;
  padding: 4px 8px;
  border: 1px solid #e5e5e5;
  border-radius: 6px;
  width: 80px;
  text-align: center;
}
```

- [ ] **Step 2: 提交更改**

```bash
git add src/app/\(shell\)/plan/plan-page.module.css
git commit -m "feat: add date picker styles"
```

---

### Task 9: 在大交通Tab添加整体时间段选择器

**Files:**
- Modify: `src/app/(shell)/plan/page.tsx:375-433`

- [ ] **Step 1: 添加日期状态**

在 PlanModal 组件中添加：
```typescript
const [startDate, setStartDate] = useState<string>('');
const [endDate, setEndDate] = useState<string>('');
```

- [ ] **Step 2: 更新 useEffect 加载编辑数据**

在 editPlan 存在时加载日期：
```typescript
if (editPlan) {
  setPlanName(editPlan.name);
  if (editPlan.startDate) setStartDate(editPlan.startDate);
  if (editPlan.endDate) setEndDate(editPlan.endDate);
  // ... 现有代码
}
```

- [ ] **Step 3: 在 transportList 后添加日期选择器**

```tsx
{activeTab === 0 && (
  <div className={styles.dateRangePicker}>
    <input
      type="date"
      className={styles.dateInput}
      value={startDate}
      onChange={(e) => setStartDate(e.target.value)}
      placeholder="开始日期"
    />
    <span className={styles.dateSeparator}>→</span>
    <input
      type="date"
      className={styles.dateInput}
      value={endDate}
      onChange={(e) => setEndDate(e.target.value)}
      placeholder="结束日期"
    />
  </div>
)}
```

- [ ] **Step 4: 更新 handleSave 包含日期**

在保存时发送 startDate 和 endDate：
```typescript
const body: any = {
  name: planName,
  items: transportList,
  activeTab,
  startDate,
  endDate,
};
```

- [ ] **Step 5: 提交更改**

```bash
git add src/app/\(shell\)/plan/page.tsx
git commit -m "feat: add date range picker to transport tab"
```

---

### Task 10: 在每条交通项添加时间段选择

**Files:**
- Modify: `src/app/(shell)/plan/page.tsx:253-373`

- [ ] **Step 1: 更新 TransportItem 接口**

```typescript
interface TransportItem {
  id: number;
  from: string;
  to: string;
  note: string;
  noteExpanded?: boolean;
  startDate?: string;
  endDate?: string;
}
```

- [ ] **Step 2: 更新 handleUpdate 支持日期字段**

```typescript
const handleUpdate = (id: number, field: 'from' | 'to' | 'note' | 'startDate' | 'endDate', value: string) => {
  setTransportList(
    transportList.map((t) => (t.id === id ? { ...t, [field]: value } : t))
  );
};
```

- [ ] **Step 3: 更新 handleAdd 添加新项时包含日期**

```typescript
const handleAdd = (currentTo?: string) => {
  const newId = Math.max(...transportList.map((t) => t.id), 0) + 1;
  const newItem: TransportItem = {
    id: newId,
    from: currentTo || '',
    to: '',
    note: '',
    noteExpanded: false,
    startDate: '',
    endDate: '',
  };
  setTransportList([...transportList, newItem]);
};
```

- [ ] **Step 4: 更新 handleDelete 清空日期**

```typescript
const handleDelete = (id: number) => {
  if (transportList.length <= 1) {
    setTransportList(
      transportList.map((t) => {
        if (t.id === id) {
          return { ...t, from: '', to: '', note: '', noteExpanded: false, startDate: '', endDate: '' };
        }
        return t;
      })
    );
    return;
  }
  setTransportList(transportList.filter((t) => t.id !== id));
};
```

- [ ] **Step 5: 在交通项显示区域添加日期选择**

在 transportRow 中，to 字段后面添加日期显示：
```tsx
<input
  type="date"
  className={styles.transportDateInput}
  value={item.startDate || ''}
  onChange={(e) => handleUpdate(item.id, 'startDate', e.target.value)}
  placeholder="开始"
/>
<span style={{ color: '#9ca3af', fontSize: '12px' }}>→</span>
<input
  type="date"
  className={styles.transportDateInput}
  value={item.endDate || ''}
  onChange={(e) => handleUpdate(item.id, 'endDate', e.target.value)}
  placeholder="结束"
/>
```

- [ ] **Step 6: 提交更改**

```bash
git add src/app/\(shell\)/plan/page.tsx
git commit -m "feat: add date selection to transport items"
```

---

### Task 11: 在我的计划列表显示时间段

**Files:**
- Modify: `src/app/(shell)/plan/page.tsx:79-104`

- [ ] **Step 1: 更新 userPlans 类型**

```typescript
const [userPlans, setUserPlans] = useState<{ id: number; name: string; start_date?: string; end_date?: string }[]>([]);
```

- [ ] **Step 2: 在计划名称后显示时间段**

```tsx
userPlans.map((plan) => (
  <div key={plan.id} className={styles.planRow} onClick={() => handleViewPlan(plan)}>
    <p className={styles.planTitle}>
      {plan.name}
      {plan.start_date && plan.end_date && (
        <span className={styles.dateLine}> ({formatDateRange(plan.start_date, plan.end_date)})</span>
      )}
    </p>
  </div>
))
```

- [ ] **Step 3: 添加日期格式化辅助函数**

```typescript
function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const formatDate = (d: Date) => {
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${m.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  };
  return `${formatDate(startDate)} → ${formatDate(endDate)}`;
}
```

- [ ] **Step 4: 提交更改**

```bash
git add src/app/\(shell\)/plan/page.tsx
git commit -m "feat: display date range in plan list"
```

---

### Task 12: 在查看弹窗显示时间段

**Files:**
- Modify: `src/app/(shell)/plan/page.tsx:113-153`

- [ ] **Step 1: 在 PlanViewModal 显示计划整体时间段**

```tsx
<div className={styles.planInfo}>
  <span className={styles.planName}>
    {plan.name}
    {plan.startDate && plan.endDate && (
      <span className={styles.dateLine}> ({formatDateRange(plan.startDate, plan.endDate)})</span>
    )}
  </span>
  {/* ... 现有代码 */}
</div>
```

- [ ] **Step 2: 在交通项显示单项时间段**

```tsx
<div key={i} className={styles.viewTransportItem}>
  <span>{item.from || '起点'}</span>
  <span>→</span>
  <span>{item.to || '终点'}</span>
  {item.startDate && item.endDate && (
    <span className={styles.dateLine}> {formatDateRange(item.startDate, item.endDate)}</span>
  )}
  {item.note && <span className={styles.viewNote}>{item.note}</span>}
</div>
```

- [ ] **Step 3: 提交更改**

```bash
git add src/app/\(shell\)/plan/page.tsx
git commit -m "feat: display date range in view modal"
```

---

### Task 13: 测试和验证

**Files:**
- 测试: 手动测试

- [ ] **Step 1: 创建新计划，添加交通项，设置时间段**

1. 点击「制定计划」
2. 在大交通Tab 添加交通项
3. 为每条交通项选择开始和结束日期
4. 在底部选择整体开始和结束日期
5. 点击「保存计划」

- [ ] **Step 2: 验证列表显示**

在「我的计划」列表中查看计划名称后是否显示时间段

- [ ] **Step 3: 验证查看弹窗**

点击计划，查看弹窗中是否显示整体时间段和交通项时间段

- [ ] **Step 4: 验证编辑功能**

点击编辑，修改时间段，保存后验证更新是否正确

- [ ] **Step 5: 提交测试结果**

```bash
git add -A
git commit -m "test: verify date selection functionality"
```

---

## 实施完成

所有任务已完成。功能包括：
- 大交通Tab首尾的整体时间段选择
- 每条交通项的独立时间段选择
- 我的计划列表正确显示时间段
- 查看弹窗显示时间段
- 编辑功能支持时间段更新