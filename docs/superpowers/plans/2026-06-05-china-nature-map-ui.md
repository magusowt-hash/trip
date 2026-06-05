# China Nature Map UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first China nature map package UI with a backend-customizable topic list, image-plus-title hero cards, and a shared map-shell topic view without real marker data.

**Architecture:** Add a new `china-nature-map` package under `src/modules/maps/packages/`, keep it as a single registered map package, and model `海岛 / 喀斯特 / 雅丹` as topics inside the package rather than independent map packages. The frontend will use one list state and one topic-shell state; the admin side will manage topic cards with title, image URL, sort order, and enabled state through a lightweight package-local settings flow.

**Tech Stack:** Next.js App Router, React, TypeScript, existing maps package registry, package-local admin/frontend modules, existing `PlanMap` shell, existing admin management patterns, Node test runner via `tsx --test`

---

## File Structure

### New files

- `src/modules/maps/packages/china-nature-map/index.ts`
  - Register the new map package metadata.
- `src/modules/maps/packages/china-nature-map/frontend/index.ts`
  - Re-export package frontend modules.
- `src/modules/maps/packages/china-nature-map/frontend/ChinaNatureMapRightPanel.tsx`
  - Render the topic list state and topic shell state in the right panel.
- `src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopics.ts`
  - Hold the initial static topic seed and topic types for UI-only mode.
- `src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.ts`
  - Contain pure helpers for topic selection and view-state transitions.
- `src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.test.ts`
  - Verify list ordering, enabled filtering, and selected-topic transitions.
- `src/modules/maps/packages/china-nature-map/admin/index.ts`
  - Re-export the admin page.
- `src/modules/maps/packages/china-nature-map/admin/ChinaNatureMapAdminPage.tsx`
  - Render the topic card admin UI for title/image URL/sort/enabled editing.
- `src/modules/maps/packages/china-nature-map/api/index.ts`
  - Re-export package-local API handlers.
- `src/modules/maps/packages/china-nature-map/api/topics.ts`
  - Provide lightweight read/write handlers for topic card configuration.
- `src/app/api/admin/maps/china-nature/topics/route.ts`
  - Route admin read/write requests into package-local topic handlers.

### Modified files

- `src/modules/maps/core/registry/map-packages.ts`
  - Register the new package in the global map package list.
- `src/modules/maps/index.ts`
  - Re-export the new package frontend/admin modules as needed.
- `src/app/(shell)/maps/page.tsx`
  - Extend the top-level `/maps` shell to render `china-nature-map` through the existing package-driven flow.
- `src/app/(shell)/maps/maps-page.module.css`
  - Add any minimal shared shell styles needed by the new package panel states if package-scoped styles are not enough.
- `src/app/api/admin/maps/[packageSlug]/page.tsx`
  - No code change expected unless package slug validation needs adjustment; verify existing behavior works with `china-nature`.
- `docs/team-work/maps/completed.md`
  - Update if implementation lands beyond current documented state.
- `docs/team-work/maps/regulation/地图包接入规范.md`
  - Update only if implementation reveals a new stable rule.

### Optional package-local style files

- `src/modules/maps/packages/china-nature-map/frontend/ChinaNatureMapRightPanel.module.css`
- `src/modules/maps/packages/china-nature-map/admin/ChinaNatureMapAdminPage.module.css`

Use package-local CSS modules if the UI cannot stay clean inside existing shared shell styles.

---

### Task 1: Add pure topic-state helpers first

**Files:**
- Create: `src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.ts`
- Create: `src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.test.ts`
- Create: `src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopics.ts`

- [ ] **Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildVisibleNatureTopics,
  createInitialNatureViewState,
  enterNatureTopicShell,
} from './chinaNatureTopicState';

test('buildVisibleNatureTopics keeps enabled topics in sort order', () => {
  const topics = buildVisibleNatureTopics([
    { topicSlug: 'karst', title: '喀斯特', coverImageUrl: 'a.jpg', sortOrder: 2, isEnabled: true },
    { topicSlug: 'island', title: '海岛', coverImageUrl: 'b.jpg', sortOrder: 1, isEnabled: true },
    { topicSlug: 'yadan', title: '雅丹', coverImageUrl: 'c.jpg', sortOrder: 3, isEnabled: false },
  ]);

  assert.deepEqual(topics.map((item) => item.topicSlug), ['island', 'karst']);
});

test('createInitialNatureViewState starts in list mode when topics exist', () => {
  const state = createInitialNatureViewState([
    { topicSlug: 'island', title: '海岛', coverImageUrl: 'b.jpg', sortOrder: 1, isEnabled: true },
  ]);

  assert.equal(state.mode, 'list');
  assert.equal(state.activeTopicSlug, null);
});

test('enterNatureTopicShell moves from list mode to topic shell mode', () => {
  const state = enterNatureTopicShell(
    { mode: 'list', activeTopicSlug: null },
    'karst',
  );

  assert.deepEqual(state, {
    mode: 'topic',
    activeTopicSlug: 'karst',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.test.ts`

Expected: FAIL with module or export-not-found errors for the new topic-state helpers.

- [ ] **Step 3: Write minimal implementation**

```ts
export type NatureTopicItem = {
  topicSlug: string;
  title: string;
  coverImageUrl: string;
  sortOrder: number;
  isEnabled: boolean;
};

export type NatureViewState =
  | { mode: 'list'; activeTopicSlug: null }
  | { mode: 'topic'; activeTopicSlug: string };

export function buildVisibleNatureTopics(topics: NatureTopicItem[]) {
  return topics
    .filter((item) => item.isEnabled)
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.topicSlug.localeCompare(b.topicSlug, 'zh-CN');
    });
}

export function createInitialNatureViewState(topics: NatureTopicItem[]): NatureViewState {
  return buildVisibleNatureTopics(topics).length > 0
    ? { mode: 'list', activeTopicSlug: null }
    : { mode: 'list', activeTopicSlug: null };
}

export function enterNatureTopicShell(
  current: NatureViewState,
  topicSlug: string,
): NatureViewState {
  void current;
  return {
    mode: 'topic',
    activeTopicSlug: topicSlug,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.test.ts`

Expected: PASS with 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.ts \
  src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.test.ts \
  src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopics.ts
git commit -m "feat: add china nature topic state helpers"
```

---

### Task 2: Register the China nature map package

**Files:**
- Create: `src/modules/maps/packages/china-nature-map/index.ts`
- Modify: `src/modules/maps/core/registry/map-packages.ts`
- Modify: `src/modules/maps/index.ts`
- Create: `src/modules/maps/packages/china-nature-map/frontend/index.ts`
- Create: `src/modules/maps/packages/china-nature-map/admin/index.ts`

- [ ] **Step 1: Write the failing test**

Add a new assertion to `src/modules/maps/core/map-package-runtime.test.ts`:

```ts
assert.ok(
  runtime.adminPackages.some((item) => item.slug === 'china-nature'),
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/modules/maps/core/map-package-runtime.test.ts`

Expected: FAIL because `china-nature` is not yet registered.

- [ ] **Step 3: Write minimal implementation**

```ts
export const chinaNatureMapPackage: MapPackage = {
  slug: 'china-nature',
  packageName: 'china-nature-map',
  name: '中国自然地图',
  description: '自然专题入口与主题切换地图。',
  admin: {
    enabled: true,
    entryPath: '/management/maps/china-nature',
    page: ChinaNatureMapAdminPage,
  },
  frontend: {
    rightPanel: ChinaNatureMapRightPanel,
  },
};
```

And add it to:

```ts
export const mapPackages: MapPackage[] = [
  standardMapPackage,
  railMapPackage,
  chinaNatureMapPackage,
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/modules/maps/core/map-package-runtime.test.ts`

Expected: PASS with the new package included.

- [ ] **Step 5: Commit**

```bash
git add src/modules/maps/core/registry/map-packages.ts \
  src/modules/maps/index.ts \
  src/modules/maps/packages/china-nature-map/index.ts \
  src/modules/maps/packages/china-nature-map/frontend/index.ts \
  src/modules/maps/packages/china-nature-map/admin/index.ts \
  src/modules/maps/core/map-package-runtime.test.ts
git commit -m "feat: register china nature map package"
```

---

### Task 3: Build the frontend topic list UI

**Files:**
- Create: `src/modules/maps/packages/china-nature-map/frontend/ChinaNatureMapRightPanel.tsx`
- Create: `src/modules/maps/packages/china-nature-map/frontend/ChinaNatureMapRightPanel.module.css`
- Modify: `src/modules/maps/packages/china-nature-map/frontend/index.ts`

- [ ] **Step 1: Write the failing test**

Extend `chinaNatureTopicState.test.ts` with:

```ts
test('buildVisibleNatureTopics returns topic cards ready for a single-column flow', () => {
  const topics = buildVisibleNatureTopics([
    { topicSlug: 'island', title: '海岛', coverImageUrl: 'island.jpg', sortOrder: 1, isEnabled: true },
  ]);

  assert.equal(topics[0]?.title, '海岛');
  assert.equal(topics[0]?.coverImageUrl, 'island.jpg');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.test.ts`

Expected: FAIL if the helper types or seed data shape are not yet aligned with the planned card UI.

- [ ] **Step 3: Write minimal implementation**

Implement the right panel with:

```tsx
type Props = {
  styles?: Record<string, string>;
};

export function ChinaNatureMapRightPanel() {
  const [viewState, setViewState] = useState(createInitialNatureViewState(defaultNatureTopics));
  const topics = buildVisibleNatureTopics(defaultNatureTopics);

  if (viewState.mode === 'topic' && viewState.activeTopicSlug) {
    const activeTopic = topics.find((item) => item.topicSlug === viewState.activeTopicSlug) ?? null;
    return (
      <section className={panelStyles.topicShell}>
        <button type="button" onClick={() => setViewState({ mode: 'list', activeTopicSlug: null })}>
          返回专题列表
        </button>
        <h3>{activeTopic?.title ?? '中国自然地图'}</h3>
        <p>当前仅展示专题地图壳，后续接入真实标注。</p>
      </section>
    );
  }

  return (
    <section className={panelStyles.topicList}>
      {topics.map((item) => (
        <button
          key={item.topicSlug}
          type="button"
          className={panelStyles.heroCard}
          style={{ backgroundImage: `url(${item.coverImageUrl})` }}
          onClick={() => setViewState(enterNatureTopicShell(viewState, item.topicSlug))}
        >
          <span className={panelStyles.heroGlass}>{item.title}</span>
        </button>
      ))}
    </section>
  );
}
```

The CSS module must provide:

- single-column stacked card flow
- large image cards
- bottom inset glass title bar
- no description block

- [ ] **Step 4: Run tests to verify helpers still pass**

Run: `npx tsx --test src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/maps/packages/china-nature-map/frontend/ChinaNatureMapRightPanel.tsx \
  src/modules/maps/packages/china-nature-map/frontend/ChinaNatureMapRightPanel.module.css \
  src/modules/maps/packages/china-nature-map/frontend/index.ts \
  src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.test.ts
git commit -m "feat: add china nature topic list UI"
```

---

### Task 4: Hook the package into the `/maps` shell

**Files:**
- Modify: `src/app/(shell)/maps/page.tsx`
- Modify: `src/app/(shell)/maps/maps-page.module.css`

- [ ] **Step 1: Write the failing test**

Add to `src/modules/maps/core/map-package-runtime.test.ts`:

```ts
assert.deepEqual(
  runtime.frontendPackages.map((item) => item.slug),
  ['rail', 'china-nature'],
);
```

Use the stored fixture in that test to disable `standard` and expect the new package to be available.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/modules/maps/core/map-package-runtime.test.ts`

Expected: FAIL because the fixture or registry doesn’t yet include the new package in the visible runtime result.

- [ ] **Step 3: Write minimal implementation**

In `/maps` shell:

- allow `activeTab === 'china-nature'`
- fetch and render `ChinaNatureMapRightPanel` through the existing package lookup
- keep the left map area on the shared `PlanMap` shell when `china-nature` is active
- do not add a new bottom map renderer for real natural markers yet

The implementation target is:

```tsx
const chinaNatureMapPackage = getMapPackage('china-nature');
const ChinaNatureRightPanel = chinaNatureMapPackage?.frontend?.rightPanel;
```

And in the panel branch:

```tsx
{activeTab === 'china-nature' ? (
  ChinaNatureRightPanel ? <ChinaNatureRightPanel styles={styles} /> : null
) : activeTab === 'rail' ? (
  ...
) : (
  ...
)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/modules/maps/core/map-package-runtime.test.ts`

Expected: PASS with the new visible package order assertion.

- [ ] **Step 5: Commit**

```bash
git add src/app/(shell)/maps/page.tsx \
  src/app/(shell)/maps/maps-page.module.css \
  src/modules/maps/core/map-package-runtime.test.ts
git commit -m "feat: surface china nature map in maps shell"
```

---

### Task 5: Build the lightweight admin topic manager UI

**Files:**
- Create: `src/modules/maps/packages/china-nature-map/admin/ChinaNatureMapAdminPage.tsx`
- Create: `src/modules/maps/packages/china-nature-map/admin/ChinaNatureMapAdminPage.module.css`
- Create: `src/modules/maps/packages/china-nature-map/api/index.ts`
- Create: `src/modules/maps/packages/china-nature-map/api/topics.ts`
- Create: `src/app/api/admin/maps/china-nature/topics/route.ts`

- [ ] **Step 1: Write the failing test**

Add a pure helper test in `chinaNatureTopicState.test.ts`:

```ts
test('buildVisibleNatureTopics drops disabled admin-managed topics', () => {
  const topics = buildVisibleNatureTopics([
    { topicSlug: 'island', title: '海岛', coverImageUrl: 'island.jpg', sortOrder: 1, isEnabled: false },
    { topicSlug: 'karst', title: '喀斯特', coverImageUrl: 'karst.jpg', sortOrder: 2, isEnabled: true },
  ]);

  assert.deepEqual(topics.map((item) => item.topicSlug), ['karst']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.test.ts`

Expected: FAIL until admin topic objects and shared topic shape are consistently wired.

- [ ] **Step 3: Write minimal implementation**

Use a package-local seed array for the first admin UI iteration and expose it through a package-local admin API.

The admin page should:

- fetch `/api/admin/maps/china-nature/topics`
- render one lightweight editable row/card per topic
- allow editing:
  - title
  - cover image URL
  - sort order
  - enabled state

The API can stay in-memory or package-local static for this UI-first phase, as long as the code boundary is explicit and named for later database replacement.

- [ ] **Step 4: Run tests to verify helper behavior still passes**

Run: `npx tsx --test src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/maps/packages/china-nature-map/admin/ChinaNatureMapAdminPage.tsx \
  src/modules/maps/packages/china-nature-map/admin/ChinaNatureMapAdminPage.module.css \
  src/modules/maps/packages/china-nature-map/api/index.ts \
  src/modules/maps/packages/china-nature-map/api/topics.ts \
  src/app/api/admin/maps/china-nature/topics/route.ts \
  src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.test.ts
git commit -m "feat: add china nature topic admin UI"
```

---

### Task 6: Verify the full UI slice and update docs if needed

**Files:**
- Modify: `docs/team-work/maps/completed.md`
- Modify: `docs/team-work/maps/regulation/地图包接入规范.md`

- [ ] **Step 1: Run focused tests**

Run: `npx tsx --test src/modules/maps/core/map-package-runtime.test.ts src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.test.ts`

Expected: PASS with all tests green.

- [ ] **Step 2: Run available project verification**

Run: `npx tsx --test src/modules/maps/core/map-package-runtime.test.ts`

Expected: PASS.

Run only if dependencies are installed:

`npm run build`

Expected: successful Next.js production build.

- [ ] **Step 3: Update team-work docs if behavior changed**

If the feature lands, add:

- `china-nature-map` to `docs/team-work/maps/completed.md`
- note that the package currently ships UI-only topic cards with backend-customizable title/image URL and no real marker data

- [ ] **Step 4: Commit**

```bash
git add docs/team-work/maps/completed.md \
  docs/team-work/maps/regulation/地图包接入规范.md
git commit -m "docs: record china nature map ui package"
```

---

## Self-Review

### Spec coverage

- `/maps` 新增中国自然地图入口: covered by Task 2 and Task 4
- 单列大图流、图片+标题、无描述: covered by Task 3
- 标题在图内底部玻璃条: covered by Task 3 CSS requirements
- 点击后进入同一底图下专题地图壳: covered by Task 3 and Task 4
- 不切底图、不做真实点位: covered by Task 3 and Task 4 implementation constraints
- 后台自定义标题与图片 URL: covered by Task 5
- 后台支持排序与启停: covered by Task 5

No uncovered spec requirement remains for this UI-first slice.

### Placeholder scan

- No `TBD` / `TODO`
- Each task has explicit files and commands
- All test steps contain real commands
- All implementation steps include concrete target code or behavior

### Type consistency

- Shared topic item shape is consistently named `NatureTopicItem`
- Shared state is consistently named `NatureViewState`
- Topic identifier stays `topicSlug`

Plan complete and saved to `docs/superpowers/plans/2026-06-05-china-nature-map-ui.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
