# Budget Bubble Fix — Design Spec

Date: 2026-05-08
Status: approved

## Design Intent (Preserved)

- Bubbles float randomly in a bounded area — playful, organic feel
- Total amount centered prominently with glass-morphism style
- Category label + note shown only on hover (clean by default)
- Double-click to inline-edit name/amount/note
- Multi-page system; pages default to numeric numbering, renamable
- Page navigation controls moved to header row (same row as currency selector)

## Changes

### 1. State Structure

- Add `pageNames: string[]` — tracks per-page name, defaults to `['1']`
- Add `editingPageName: boolean` — toggles page name inline edit mode
- Remove dead `budgetName` state (never set by any input; always falls back to `selectedCategory`)
- Move `CUSTOM_CAT_COLORS` outside component as module constant

### 2. Page Navigation in Header

- New `.budgetPageNav` flex container between mode toggle and currency selector
- Navigation: `◀` (prev) · page name (editable) · `▶` (next) · `＋` (new page)
- `◀` hidden on page 0; `▶` hidden on last page; entire nav hidden if only 1 page
- Page name click → inline `<input>`, Enter/blur saves, Esc cancels
- `＋` appends new empty page, auto-navigates to it
- Delete last bubble on a page → remove that page entirely; if it was current page, jump to previous or next

### 3. Placement Algorithm

- New constants: `BUBBLE_REAL_W = 98`, `BUBBLE_REAL_H = 66` (matching CSS: content + padding + border)
- `tryPlaceBubble()` uses real dimensions for collision detection
- Safe zone: `safeW = 180, safeH = 100` (covers capsule-shaped total + margin)
- `GAP` increased from 5 to 8
- Container: `.bubbleArea` `overflow: hidden` (was `overflow-y: hidden; overflow-x: auto`)
- Placement ensures bubble stays within visible area bounds

### 4. Hover Interaction Stability

- `.amountBubble::before` pseudo-element extends hover hit area 24px above and below
- Hovered bubble gets `z-index: 5` so `scale(1.05)` doesn't get covered by neighbors
- Delete button repositioned: `right: -6px, top: -6px`

### 5. Note Popover & Editing

- Popover positioning: use relative coords within bubble area instead of viewport coords
- Editing: `select()` on existing text when entering edit mode
- Escape key cancels inline edit
- Editing bubble gets `z-index: 10`

### 6. CSS Cleanup

- Remove unused `.bubbleName` class
- Merge duplicate `.budgetInputGroup` definitions
- Add `.budgetPageNav` and related classes (nav arrow, page name, page name input, new-page button)

## Files Affected

- `src/app/(shell)/plan/page.tsx`
- `src/app/(shell)/plan/plan-page.module.css`

## Out of Scope

- Database persistence for budget items
- Page reordering via drag-and-drop
- Force-directed bubble layout
- Animation/transitions between pages
- Mobile long-press support
