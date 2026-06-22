# China Nature Islands Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real island topic data to the China Nature map package from the provided CSV and surface it in the China Nature map UI.

**Architecture:** Keep `china-nature-map` as one package and add package-local island data plus a tiny topic state/controller layer. Render island markers on the existing `PlanMap`, and update the right panel so the user can enter the island topic and browse the imported islands list without changing the shared `/maps` shell structure.

**Tech Stack:** Next.js App Router, React, TypeScript, Node test runner, existing `PlanMap` marker support.

---

### Task 1: Add failing tests for island CSV-backed data

**Files:**
- Create: `src/modules/maps/packages/china-nature-map/frontend/chinaNatureIslandData.test.ts`
- Modify: `src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopics.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('buildChinaNatureTopicDataset returns 30 islands for island topic sorted by ranking', () => {
  const dataset = buildChinaNatureTopicDataset('island');
  assert.equal(dataset.items.length, 30);
  assert.equal(dataset.items[0]?.name, '西沙群岛');
  assert.equal(dataset.items[29]?.name, '獐子岛');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/modules/maps/packages/china-nature-map/frontend/chinaNatureIslandData.test.ts`
Expected: FAIL with missing export or dataset builder.

- [ ] **Step 3: Write minimal implementation**

```ts
export function buildChinaNatureTopicDataset(topicSlug: string) {
  if (topicSlug !== 'island') {
    return { items: [] };
  }

  return { items: chinaNatureIslandEntries.slice().sort((a, b) => a.rank - b.rank) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/modules/maps/packages/china-nature-map/frontend/chinaNatureIslandData.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/maps/packages/china-nature-map/frontend/chinaNatureIslandData.test.ts src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopics.ts
git commit -m "feat: add china nature island dataset"
```

### Task 2: Add failing tests for island topic view state and markers

**Files:**
- Modify: `src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.test.ts`
- Modify: `src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('buildNatureTopicMarkers maps island items to PlanMap markers', () => {
  const markers = buildNatureTopicMarkers([
    { id: 'island-1', name: '西沙群岛', lng: 112.333333, lat: 16.836667, locationLabel: '海南省三沙市' },
  ]);

  assert.deepEqual(markers[0], {
    id: 'island-1',
    position: [112.333333, 16.836667],
    title: '西沙群岛',
    address: '海南省三沙市',
    description: '中国自然地图·海岛',
    groupColor: '#0f766e',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.test.ts`
Expected: FAIL with missing helper.

- [ ] **Step 3: Write minimal implementation**

```ts
export function buildNatureTopicMarkers(items: NatureDatasetItem[]) {
  return items.map((item) => ({
    id: item.id,
    position: [item.lng, item.lat] as [number, number],
    title: item.name,
    address: item.locationLabel,
    description: '中国自然地图·海岛',
    groupColor: '#0f766e',
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.ts src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.test.ts
git commit -m "feat: add china nature island marker helpers"
```

### Task 3: Wire the dataset into the China Nature right panel and `/maps`

**Files:**
- Modify: `src/modules/maps/packages/china-nature-map/frontend/ChinaNatureMapRightPanel.tsx`
- Modify: `src/modules/maps/packages/china-nature-map/frontend/ChinaNatureMapRightPanel.module.css`
- Modify: `src/modules/maps/packages/china-nature-map/frontend/index.ts`
- Modify: `src/modules/maps/index.ts`
- Modify: `src/app/(shell)/maps/page.tsx`

- [ ] **Step 1: Write the failing integration behavior test or state assertions**

```ts
test('enterNatureTopicShell activates island topic from the list state', () => {
  const state = enterNatureTopicShell({ mode: 'list', activeTopicSlug: null }, 'island');
  assert.deepEqual(state, { mode: 'topic', activeTopicSlug: 'island' });
});
```

- [ ] **Step 2: Run focused tests to keep a red-green loop**

Run: `node --test src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.test.ts src/modules/maps/packages/china-nature-map/frontend/chinaNatureIslandData.test.ts`
Expected: PASS before UI wiring, then use the existing passing tests as a regression guard during UI edits.

- [ ] **Step 3: Write minimal implementation**

```tsx
<ChinaNatureRightPanel
  styles={styles}
  viewState={natureViewState}
  topics={natureTopics}
  activeTopic={activeNatureTopic}
  items={activeNatureItems}
  onEnterTopic={setNatureViewState}
  onBackToList={resetNatureViewState}
  onItemSelect={setNatureFocusItemId}
/>
```

- [ ] **Step 4: Run tests and app verification**

Run: `node --test src/modules/maps/packages/china-nature-map/frontend/chinaNatureTopicState.test.ts src/modules/maps/packages/china-nature-map/frontend/chinaNatureIslandData.test.ts`
Expected: PASS

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(shell)/maps/page.tsx' src/modules/maps/index.ts src/modules/maps/packages/china-nature-map/frontend/*
git commit -m "feat: show china nature island data on map"
```
