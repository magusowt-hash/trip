# Budget Bubble Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 16 identified defects in the budget bubble view while implementing page navigation redesign (controls in header, renamable pages).

**Architecture:** Single-page fix within the existing plan editor. All budget logic stays inline in `PlanModal`. No new files, no new dependencies. Changes touch only `page.tsx` (state + JSX + handlers) and `plan-page.module.css` (styles).

**Tech Stack:** React 18 (useState/useRef), CSS Modules, Next.js 14 App Router

---

### Task 1: CSS Cleanup — Remove dead styles and merge duplicates

**Files:**
- Modify: `src/app/(shell)/plan/plan-page.module.css`

- [ ] **Step 1: Remove duplicate `.budgetInputGroup` block (lines 1898-1903)**

Find and delete this duplicate:
```css
.budgetInputGroup {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-shrink: 0;
}
```

The first definition at line 1856 (which includes `margin-left: auto`) is the correct one and stays.

- [ ] **Step 2: Remove unused `.bubbleName` class (lines 2165-2171)**

Delete:
```css
.bubbleName {
  font-size: 10px;
  color: #c7c9cc;
  text-align: center;
  margin-top: 2px;
  white-space: nowrap;
}
```

- [ ] **Step 3: Remove unused `.budgetCatRow` and `.budgetSpacer` classes (lines 1886-1896)**

Delete:
```css
.budgetCatRow {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  align-items: center;
}

.budgetSpacer {
  flex: 1;
  min-width: 0;
}
```

- [ ] **Step 4: Verify the file is clean**

Run: `grep -n 'bubbleName\|bubbleName' src/app/(shell)/plan/plan-page.module.css`
Expected: No output (both removed).

- [ ] **Step 5: Commit**

```bash
git add src/app/(shell)/plan/plan-page.module.css
git commit -m "chore: clean up unused CSS classes and duplicate definitions in plan page"
```

---

### Task 2: Fix placement algorithm and container overflow

**Files:**
- Modify: `src/app/(shell)/plan/page.tsx`
- Modify: `src/app/(shell)/plan/plan-page.module.css`

- [ ] **Step 1: Update placement constants in page.tsx (line 521)**

Replace:
```ts
const BUBBLE_W = 62, BUBBLE_H = 46, GAP = 5;
```
With:
```ts
const BUBBLE_W = 62, BUBBLE_H = 46, BUBBLE_REAL_W = 98, BUBBLE_REAL_H = 66, GAP = 8;
```

These real dimensions match CSS: 62+32padding+4border = 98 width, 46+16padding+4border = 66 height.

- [ ] **Step 2: Update `tryPlaceBubble` to use real dimensions and expanded safe zone**

Replace lines 534-552:
```ts
const tryPlaceBubble = (existing: Record<number, { x: number; y: number }>, w: number, h: number): { x: number; y: number } | null => {
    const safeW = 170, safeH = 90;
    const cx = w / 2, cy = h / 2;
    const padB = 30;
    const ids = Object.keys(existing).map(Number);
    for (let i = 0; i < 600; i++) {
      const x = BUBBLE_W / 2 + Math.random() * (w - BUBBLE_W);
      const y = BUBBLE_H / 2 + padB + Math.random() * (h - BUBBLE_H - padB);
      if (Math.abs(x - cx) < safeW / 2 + BUBBLE_W / 2 && Math.abs(y - cy) < safeH / 2 + BUBBLE_H / 2) continue;
      let ok = true;
      for (const id of ids) {
        const p = existing[id];
        if (!p) continue;
        if (Math.abs(x - p.x) < BUBBLE_W + GAP && Math.abs(y - p.y) < BUBBLE_H + GAP) { ok = false; break; }
      }
      if (ok) return { x, y };
    }
    return null;
  };
```
With:
```ts
const tryPlaceBubble = (existing: Record<number, { x: number; y: number }>, w: number, h: number): { x: number; y: number } | null => {
    const safeW = 180, safeH = 100;
    const cx = w / 2, cy = h / 2;
    const pad = 10;
    const ids = Object.keys(existing).map(Number);
    for (let i = 0; i < 600; i++) {
      const x = BUBBLE_REAL_W / 2 + pad + Math.random() * (w - BUBBLE_REAL_W - pad * 2);
      const y = BUBBLE_REAL_H / 2 + pad + Math.random() * (h - BUBBLE_REAL_H - pad * 2);
      if (Math.abs(x - cx) < safeW / 2 + BUBBLE_REAL_W / 2 && Math.abs(y - cy) < safeH / 2 + BUBBLE_REAL_H / 2) continue;
      let ok = true;
      for (const id of ids) {
        const p = existing[id];
        if (!p) continue;
        if (Math.abs(x - p.x) < BUBBLE_REAL_W + GAP && Math.abs(y - p.y) < BUBBLE_REAL_H + GAP) { ok = false; break; }
      }
      if (ok) return { x, y };
    }
    return null;
  };
```

Key changes: uses `BUBBLE_REAL_W/H` for collision; `pad` replaces `padB` (10px margin from edges); `safeW`/`safeH` expanded slightly.

- [ ] **Step 3: Update bubble positioning in JSX to use real dimensions**

Find the inline style in the bubble `<div>` (lines 993-996):
```tsx
style={{ borderColor: color, left: pos.x - BUBBLE_W / 2, top: pos.y - BUBBLE_H / 2 }}
```
Replace with:
```tsx
style={{ borderColor: color, left: pos.x - BUBBLE_REAL_W / 2, top: pos.y - BUBBLE_REAL_H / 2 }}
```

- [ ] **Step 4: Fix `.bubbleArea` overflow in CSS (line 2010-2011)**

Replace:
```css
overflow-x: auto;
overflow-y: hidden;
```
With:
```css
overflow: hidden;
```

- [ ] **Step 5: Commit**

```bash
git add src/app/(shell)/plan/page.tsx src/app/(shell)/plan/plan-page.module.css
git commit -m "fix: correct bubble placement dimensions and container overflow in budget view"
```

---

### Task 3: State restructure — remove dead state, add page naming

**Files:**
- Modify: `src/app/(shell)/plan/page.tsx`

- [ ] **Step 1: Move `CUSTOM_CAT_COLORS` outside component (before component definition)**

In the file, find line 504 inside the component:
```ts
const CUSTOM_CAT_COLORS = ['#f43f5e', '#14b8a6', '#a855f7', '#eab308'];
const CURRENCIES = ['¥', '$', '€', '£', '₩', '฿'];
```

Move `CUSTOM_CAT_COLORS` to module scope (before the component, after line 31 or near line 50 where `PACK_CATEGORIES` is). Add `CURRENCIES` too:

```ts
const CUSTOM_CAT_COLORS = ['#f43f5e', '#14b8a6', '#a855f7', '#eab308'];
const CURRENCIES = ['¥', '$', '€', '£', '₩', '฿'];
```

Delete the same lines from inside the component body (line 504-505).

- [ ] **Step 2: Remove dead `budgetName` state, add `pageNames` and `editingPageName`**

Replace lines 486-497:
```ts
const [budgetList, setBudgetList] = useState<BudgetItem[]>([]);
const [budgetViewMode, setBudgetViewMode] = useState<'bubble' | 'list'>('bubble');
const [budgetName, setBudgetName] = useState('');
const [budgetAmount, setBudgetAmount] = useState('');
const [budgetNote, setBudgetNote] = useState('');
const [selectedCategory, setSelectedCategory] = useState('');
const [showCustomInput, setShowCustomInput] = useState(false);
const [customCategoryName, setCustomCategoryName] = useState('');
const [customCategories, setCustomCategories] = useState<string[]>([]);
const [currency, setCurrency] = useState('¥');
const [pages, setPages] = useState<Record<number, { x: number; y: number }>[]>([{}]);
const [currentPage, setCurrentPage] = useState(0);
```
With:
```ts
const [budgetList, setBudgetList] = useState<BudgetItem[]>([]);
const [budgetViewMode, setBudgetViewMode] = useState<'bubble' | 'list'>('bubble');
const [budgetAmount, setBudgetAmount] = useState('');
const [budgetNote, setBudgetNote] = useState('');
const [selectedCategory, setSelectedCategory] = useState('');
const [showCustomInput, setShowCustomInput] = useState(false);
const [customCategoryName, setCustomCategoryName] = useState('');
const [customCategories, setCustomCategories] = useState<string[]>([]);
const [currency, setCurrency] = useState('¥');
const [pages, setPages] = useState<Record<number, { x: number; y: number }>[]>([{}]);
const [pageNames, setPageNames] = useState<string[]>(['1']);
const [currentPage, setCurrentPage] = useState(0);
const [editingPageName, setEditingPageName] = useState(false);
```

Note: `budgetName` removed, `pageNames` and `editingPageName` added.

- [ ] **Step 3: Update `handleBudgetAdd` to use `selectedCategory` directly (line 555)**

Replace:
```ts
const name = budgetName.trim() || selectedCategory;
```
With:
```ts
const name = selectedCategory;
```

- [ ] **Step 4: Update `handleCategorySelect` to remove `setBudgetName` call (line 524-532)**

Replace:
```ts
const handleCategorySelect = (cat: string) => {
    if (selectedCategory === cat) {
      setSelectedCategory('');
      setBudgetName('');
      return;
    }
    setSelectedCategory(cat);
    setShowCustomInput(false);
  };
```
With:
```ts
const handleCategorySelect = (cat: string) => {
    if (selectedCategory === cat) {
      setSelectedCategory('');
      return;
    }
    setSelectedCategory(cat);
    setShowCustomInput(false);
  };
```

- [ ] **Step 5: Commit**

```bash
git add src/app/(shell)/plan/page.tsx
git commit -m "refactor: remove dead budgetName state, add pageNames for page naming, hoist constants"
```

---

### Task 4: Hover stability — ::before pseudo-element, z-index fixes

**Files:**
- Modify: `src/app/(shell)/plan/plan-page.module.css`

- [ ] **Step 1: Add `::before` pseudo-element to extend hover area on `.amountBubble`**

Insert after the existing `.amountBubble` block (after line 2077, before `.amountBubble:hover`):

```css
.amountBubble::before {
  content: '';
  position: absolute;
  top: -24px;
  bottom: -24px;
  left: -8px;
  right: -8px;
  z-index: -1;
}
```

The existing `.amountBubble` has `z-index: 1` and `position: absolute`, so `::before` with `z-index: -1` will sit behind but still intercept hover events, expanding the hoverable area 24px above and below to encompass the `.bubbleCat` and `.bubbleNote` tooltips.

- [ ] **Step 2: Add hover z-index elevation to `.amountBubble:hover`**

Replace at line 2079-2081:
```css
.amountBubble:hover {
  transform: scale(1.05);
}
```
With:
```css
.amountBubble:hover {
  transform: scale(1.05);
  z-index: 5;
}
```

- [ ] **Step 3: Adjust `.bubbleDelBtn` position for better fit**

Replace at lines 2097-2115:
```css
.bubbleDelBtn {
  position: absolute;
  top: 0;
  right: -8px;
  ...
}
```
With:
```css
.bubbleDelBtn {
  position: absolute;
  top: -6px;
  right: -6px;
  ...
}
```

(Only change `top: 0` to `top: -6px` and `right: -8px` to `right: -6px`.)

- [ ] **Step 4: Commit**

```bash
git add src/app/(shell)/plan/plan-page.module.css
git commit -m "fix: improve hover stability with extended hit area and z-index elevation for bubbles"
```

---

### Task 5: Header page navigation — UI structure

**Files:**
- Modify: `src/app/(shell)/plan/page.tsx`
- Modify: `src/app/(shell)/plan/plan-page.module.css`

- [ ] **Step 1: Add new CSS classes for page navigation**

Insert before the `.bubbleArea` definition (around line 2001):

```css
.budgetPageNav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.pageNavArrow {
  width: 28px;
  height: 28px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 50%;
  background: #fff;
  color: #6b7280;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.15s ease;
}

.pageNavArrow:hover {
  border-color: #93c5fd;
  color: #3b82f6;
}

.pageNavArrow:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.pageNavName {
  font-size: 13px;
  color: #1d1d1f;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  min-width: 48px;
  text-align: center;
  transition: background 0.15s ease;
}

.pageNavName:hover {
  background: #f5f5f5;
}

.pageNavNameInput {
  width: 60px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid #007aff;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  text-align: center;
  background: #fff;
  color: #1d1d1f;
  box-sizing: border-box;
}

.pageNavAdd {
  width: 28px;
  height: 28px;
  border: 1px dashed rgba(0, 0, 0, 0.12);
  border-radius: 50%;
  background: #fff;
  color: #9ca3af;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.15s ease;
}

.pageNavAdd:hover {
  border-color: #007aff;
  color: #007aff;
}
```

- [ ] **Step 2: Remove old page tabs from inside `.bubbleArea`**

In `page.tsx`, find the bubble area section (lines 972-985) and remove the page tabs block:

Delete:
```tsx
{pages.length > 1 && (
  <div className={styles.pageTabs}>
    {pages.map((_, i) => (
      <button
        key={i}
        type="button"
        className={`${styles.pageTab} ${i === currentPage ? styles.pageTabActive : ''}`}
        onClick={() => setCurrentPage(i)}
      >{i + 1}</button>
    ))}
  </div>
)}
```

- [ ] **Step 3: Add page navigation in header (between mode toggle and top-right)**

In `renderBudgetList`, find the header section (lines 915-970) and insert page nav between `.budgetModeToggle` and `.budgetTopRight`:

Replace the header JSX (lines 915-970):
```tsx
<div className={styles.budgetHeader}>
  <div className={styles.budgetModeToggle}>
    <button ... >气泡</button>
    <button ... >列表</button>
  </div>
  <div className={styles.budgetTopRight}>
    ...
  </div>
</div>
```

Insert page nav after `.budgetModeToggle`:

```tsx
<div className={styles.budgetHeader}>
  <div className={styles.budgetModeToggle}>
    <button
      type="button"
      className={`${styles.budgetModeBtn} ${budgetViewMode === 'bubble' ? styles.budgetModeActive : ''}`}
      onClick={() => setBudgetViewMode('bubble')}
    >气泡</button>
    <button
      type="button"
      className={`${styles.budgetModeBtn} ${budgetViewMode === 'list' ? styles.budgetModeActive : ''}`}
      onClick={() => setBudgetViewMode('list')}
    >列表</button>
  </div>
  {pages.length > 1 && (
    <div className={styles.budgetPageNav}>
      <button
        type="button"
        className={styles.pageNavArrow}
        disabled={currentPage === 0}
        onClick={() => setCurrentPage(currentPage - 1)}
      >◀</button>
      {editingPageName ? (
        <input
          className={styles.pageNavNameInput}
          value={pageNames[currentPage]}
          onChange={(e) => {
            setPageNames(pageNames.map((n, i) => i === currentPage ? e.target.value : n));
          }}
          onBlur={() => setEditingPageName(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setEditingPageName(false);
            if (e.key === 'Escape') setEditingPageName(false);
          }}
          autoFocus
        />
      ) : (
        <span
          className={styles.pageNavName}
          onClick={() => setEditingPageName(true)}
        >第{pageNames[currentPage]}页</span>
      )}
      <button
        type="button"
        className={styles.pageNavArrow}
        disabled={currentPage >= pages.length - 1}
        onClick={() => setCurrentPage(currentPage + 1)}
      >▶</button>
      <button
        type="button"
        className={styles.pageNavAdd}
        onClick={() => {
          setPages(prev => [...prev, {}]);
          setPageNames(prev => [...prev, String(prev.length + 1)]);
          setCurrentPage(pages.length);
        }}
      >＋</button>
    </div>
  )}
  <div className={styles.budgetTopRight}>
    {/* existing currency + custom category UI stays here */}
  </div>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(shell)/plan/page.tsx src/app/(shell)/plan/plan-page.module.css
git commit -m "feat: move page navigation from bubble area to header with arrows and page naming"
```

---

### Task 6: Delete logic fix — clean up empty pages

**Files:**
- Modify: `src/app/(shell)/plan/page.tsx`

- [ ] **Step 1: Replace `handleBudgetDelete` (lines 578-587)**

Replace:
```ts
const handleBudgetDelete = (id: number) => {
    setBudgetList(budgetList.filter(b => b.id !== id));
    setPages(prev => {
      const copy = prev.map(p => { const n = { ...p }; delete n[id]; return n; });
      return copy.filter((p, i) => i === 0 || Object.keys(p).length > 0);
    });
    if (currentPagePositions[id] && Object.keys(currentPagePositions).length === 1) {
      setCurrentPage(Math.max(0, currentPage - 1));
    }
  };
```
With:
```ts
const handleBudgetDelete = (id: number) => {
    setBudgetList(budgetList.filter(b => b.id !== id));
    setPages(prev => {
      const copy = prev.map(p => {
        const n = { ...p };
        delete n[id];
        return n;
      });
      const filtered = copy.filter((p, i) => i === 0 || Object.keys(p).length > 0);
      const removedCount = copy.length - filtered.length;
      if (removedCount > 0) {
        setPageNames(pns => {
          const newNames = [...pns];
          for (let i = copy.length - 1; i >= 0; i--) {
            if (i > 0 && Object.keys(copy[i]).length === 0) {
              newNames.splice(i, 1);
            }
          }
          return newNames.length > 0 ? newNames : ['1'];
        });
        if (currentPage >= filtered.length) {
          setCurrentPage(Math.max(0, filtered.length - 1));
        }
      }
      return filtered;
    });
    if (currentPagePositions[id] && Object.keys(currentPagePositions).length === 1 && currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };
```

This handles: removing empty pages from `pages` and `pageNames`, adjusting `currentPage` when pages shift.

- [ ] **Step 2: Commit**

```bash
git add src/app/(shell)/plan/page.tsx
git commit -m "fix: properly clean up empty budget pages when deleting last bubble"
```

---

### Task 7: Note popover — fix positioning with relative coordinates

**Files:**
- Modify: `src/app/(shell)/plan/page.tsx`

- [ ] **Step 1: Replace `handleBudgetNoteOpen` (lines 593-601)**

Replace:
```ts
const handleBudgetNoteOpen = (itemId: number, e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest('.budget-note-btn') as HTMLElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const item = budgetList.find(b => b.id === itemId);
    setBudgetNoteText(item?.note || '');
    setBudgetNotePos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
    setBudgetNoteId(itemId);
  };
```
With:
```ts
const handleBudgetNoteOpen = (itemId: number, e: React.MouseEvent) => {
    const area = bubbleAreaRef.current;
    if (!area) return;
    const areaRect = area.getBoundingClientRect();
    const targetRect = (e.target as HTMLElement).getBoundingClientRect();
    const top = targetRect.bottom - areaRect.top + area.scrollTop + 6;
    const left = targetRect.left + targetRect.width / 2 - areaRect.left + area.scrollLeft;
    const item = budgetList.find(b => b.id === itemId);
    setBudgetNoteText(item?.note || '');
    setBudgetNotePos({ top, left });
    setBudgetNoteId(itemId);
  };
```

This converts viewport coordinates to coordinates relative to the bubble area, correctly accounting for scroll position.

- [ ] **Step 2: Commit**

```bash
git add src/app/(shell)/plan/page.tsx
git commit -m "fix: use bubble-area-relative coordinates for budget note popover"
```

---

### Task 8: Edit enhancements — auto-select text, escape cancel, edit z-index

**Files:**
- Modify: `src/app/(shell)/plan/page.tsx`
- Modify: `src/app/(shell)/plan/plan-page.module.css`

- [ ] **Step 1: Add `select()` on text and Escape to cancel in edit inputs**

Find the inline edit inputs in the bubble rendering (around lines 998-1012). Update each to add Escape handling and `ref`-based auto-select. Since the inputs use `autoFocus` already, add an `onFocus` to select all text:

First, add a helper to select all text on focus. Replace the input blocks for editing to include `onFocus`:

For the amount input (line 998-999), change:
```tsx
<input className={styles.bubbleFieldInput} type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleFieldEditSave} onKeyDown={(e) => e.key === 'Enter' && handleFieldEditSave()} autoFocus />
```
To:
```tsx
<input className={styles.bubbleFieldInput} type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleFieldEditSave} onKeyDown={(e) => { if (e.key === 'Enter') handleFieldEditSave(); if (e.key === 'Escape') setEditingField(null); }} onFocus={(e) => e.target.select()} autoFocus />
```

For the name input (line 1004-1005), change:
```tsx
<input className={styles.bubbleFieldInput} value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleFieldEditSave} onKeyDown={(e) => e.key === 'Enter' && handleFieldEditSave()} autoFocus />
```
To:
```tsx
<input className={styles.bubbleFieldInput} value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleFieldEditSave} onKeyDown={(e) => { if (e.key === 'Enter') handleFieldEditSave(); if (e.key === 'Escape') setEditingField(null); }} onFocus={(e) => e.target.select()} autoFocus />
```

For the textarea (line 1009-1010), change:
```tsx
<textarea className={styles.bubbleFieldTextarea} value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleFieldEditSave} rows={1} autoFocus />
```
To:
```tsx
<textarea className={styles.bubbleFieldTextarea} value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleFieldEditSave} onKeyDown={(e) => { if (e.key === 'Escape') setEditingField(null); }} onFocus={(e) => e.target.select()} rows={1} autoFocus />
```

- [ ] **Step 2: Add editing-bubble z-index elevation in CSS**

Insert after the existing `.bubbleCat:hover` line (after line 2191):

```css
.amountBubble:has(.bubbleFieldInput),
.amountBubble:has(.bubbleFieldTextarea) {
  z-index: 10;
}
```

This elevates any bubble currently being edited above all others.

- [ ] **Step 3: Commit**

```bash
git add src/app/(shell)/plan/page.tsx src/app/(shell)/plan/plan-page.module.css
git commit -m "feat: add text select on edit focus, escape to cancel, and edit z-index elevation"
```

---

### Task 9: Verification — compile, lint, typecheck

**Files:**
- (none — verification only)

- [ ] **Step 1: Run TypeScript type check**

```bash
npx tsc --noEmit 2>&1 | head -50
```
Expected: No errors from `src/app/(shell)/plan/page.tsx`.

- [ ] **Step 2: Run linter**

```bash
npx next lint 2>&1 | tail -20
```
Expected: No new errors introduced.

- [ ] **Step 3: Verify build**

```bash
npx next build 2>&1 | tail -10
```
Expected: Successful build.

- [ ] **Step 4: Commit any remaining fixes if needed**

If the verification steps above reveal any issues, fix them and commit.

---

### Task 10: Remove unused `.pageTab` and `.pageTabActive` CSS (clean follow-up)

**Files:**
- Modify: `src/app/(shell)/plan/plan-page.module.css`

Now that page tabs are moved to header and use new classes (`.pageNavArrow`, `.pageNavName`, etc.), the old `.pageTab`, `.pageTab:hover`, `.pageTabActive` classes (lines 2034-2059) are unused.

- [ ] **Step 1: Remove old page tab classes (lines 2034-2059)**

Delete:
```css
.pageTab {
  width: 28px;
  height: 28px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 50%;
  background: #fff;
  color: #9ca3af;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.pageTab:hover {
  border-color: #93c5fd;
  color: #3b82f6;
}

.pageTabActive {
  background: #007aff;
  border-color: #007aff;
  color: #fff;
}
```

- [ ] **Step 2: Remove `bubbleGrid` dead style (line 2062)**

Delete:
```css
.bubbleGrid { display: none; }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(shell)/plan/plan-page.module.css
git commit -m "chore: remove unused pageTab and bubbleGrid CSS classes"
```

---

## Summary

| Task | File(s) | Description |
|------|---------|-------------|
| 1 | CSS | Remove dead/duplicate CSS |
| 2 | TSX + CSS | Fix placement dimensions + overflow |
| 3 | TSX | State restructure (remove budgetName, add pageNames) |
| 4 | CSS | Hover stability (::before, z-index) |
| 5 | TSX + CSS | Page nav in header UI |
| 6 | TSX | Delete empty page cleanup |
| 7 | TSX | Note popover relative coords |
| 8 | TSX + CSS | Edit: select text, escape, z-index |
| 9 | — | Build/typecheck/lint verification |
| 10 | CSS | Remove obsolete pageTab styles |
