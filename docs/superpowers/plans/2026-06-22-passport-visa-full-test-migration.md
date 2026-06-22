# Passport Visa Full Test Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the current `test` passport-visa frontend and admin experience into the formal `china-passport-visa-map` package so `/maps` enters the same full-screen experience and the package admin matches the current test admin behavior.

**Architecture:** Reuse the existing `test` passport-visa page, admin page, helper libraries, and bootstrap/admin repository chain as the canonical implementation, then adapt imports and route ownership so the formal map package delegates to the same logic instead of maintaining a second simplified implementation. Keep the `/maps` entry shell unchanged at the package list level, but once the passport-visa package is selected, render the same full-screen frontend as `test/app/passport-visa/page.tsx`.

**Tech Stack:** Next.js App Router, React, TypeScript, Node test runner, existing `maps` package registry, existing `test/lib/passportVisa*` helpers, file-backed admin repository.

---

### Task 1: Lock down the shared passport-visa helper surface

**Files:**
- Test: `test/lib/passportVisaLegendFilters.test.mjs`
- Test: `test/lib/passportVisaFlag.test.mjs`
- Test: `test/lib/passportVisaViewport.test.mjs`
- Test: `test/lib/passportVisaSvgStroke.test.mjs`
- Test: `test/lib/passportVisaOverlay.test.mjs`
- Test: `test/lib/passportVisaHoverCard.test.mjs`
- Test: `test/lib/passportVisaRiskMark.test.mjs`
- Test: `test/lib/passportVisaDetailInfo.test.mjs`
- Test: `test/lib/passportVisaAdminRepository.test.mjs`
- Test: `test/lib/passportVisaAdminValidation.test.mjs`
- Test: `test/lib/passportVisaAdminSelection.test.mjs`
- Test: `scripts/syncMfaCountrySections.test.mjs`

- [ ] **Step 1: Run the existing helper and admin tests as the red baseline**

```bash
node --test \
  test/lib/passportVisaLegendFilters.test.mjs \
  test/lib/passportVisaFlag.test.mjs \
  test/lib/passportVisaViewport.test.mjs \
  test/lib/passportVisaSvgStroke.test.mjs \
  test/lib/passportVisaOverlay.test.mjs \
  test/lib/passportVisaHoverCard.test.mjs \
  test/lib/passportVisaRiskMark.test.mjs \
  test/lib/passportVisaDetailInfo.test.mjs \
  test/lib/passportVisaAdminRepository.test.mjs \
  test/lib/passportVisaAdminValidation.test.mjs \
  test/lib/passportVisaAdminSelection.test.mjs \
  scripts/syncMfaCountrySections.test.mjs
```

- [ ] **Step 2: Confirm the baseline is green before any migration**

Expected: PASS across all listed tests so migration can preserve current behavior exactly.

- [ ] **Step 3: Commit the untouched green baseline if needed**

```bash
git status --short
```

Expected: no migration-specific file edits yet.

### Task 2: Add a failing integration test for the formal package fullscreen contract

**Files:**
- Modify: `src/modules/maps/packages/china-passport-visa-map/frontend/passportVisaState.test.mjs`
- Modify: `src/modules/maps/packages/china-passport-visa-map/frontend/index.ts`

- [ ] **Step 1: Write a failing test for the formal package using the test bootstrap semantics**

```js
test('formal passport visa package exposes full frontend entry points', async () => {
  const frontend = await import('./index.ts');

  assert.equal(typeof frontend.PassportVisaMapView, 'function');
  assert.equal(typeof frontend.ChinaPassportVisaMapRightPanel, 'function');
});
```

- [ ] **Step 2: Run the focused test to verify the current formal package surface fails the new contract if missing**

```bash
node --test src/modules/maps/packages/china-passport-visa-map/frontend/passportVisaState.test.mjs
```

- [ ] **Step 3: Keep the failure output as the migration checkpoint**

Expected: failure only if a required fullscreen/frontend export is missing after refactor steps.

### Task 3: Replace the simplified formal frontend with the test frontend

**Files:**
- Create or modify: `src/modules/maps/packages/china-passport-visa-map/frontend/PassportVisaPage.tsx`
- Modify: `src/modules/maps/packages/china-passport-visa-map/frontend/PassportVisaMapView.tsx`
- Modify: `src/modules/maps/packages/china-passport-visa-map/frontend/PassportVisaMapView.module.css`
- Modify: `src/modules/maps/packages/china-passport-visa-map/frontend/ChinaPassportVisaMapRightPanel.tsx`
- Modify: `src/modules/maps/packages/china-passport-visa-map/frontend/ChinaPassportVisaMapRightPanel.module.css`
- Modify: `src/modules/maps/packages/china-passport-visa-map/frontend/index.ts`
- Reuse from test: `test/app/passport-visa/page.tsx`
- Reuse from test: `test/app/passport-visa/page.module.css`
- Reuse from test libs: `test/lib/passportVisa*.ts*`

- [ ] **Step 1: Copy the test page structure into the formal package behind package-local imports**

```tsx
export function PassportVisaPage() {
  return <TestEquivalentPassportVisaPage />;
}
```

- [ ] **Step 2: Adapt the test page imports to stable package-owned entry points**

```tsx
import { createDefaultPassportVisaAdminFileRepository } from '@/test/lib/passportVisaAdminRepository';
import { buildPassportVisaScenarioOptions } from '@/test/lib/passportVisaScenarios';
```

Replace fragile relative imports with either `@/test/lib/...` or package-local adapters so the formal package can reuse the exact logic.

- [ ] **Step 3: Make the package right panel a thin launcher rather than a parallel simplified UI**

```tsx
export function ChinaPassportVisaMapRightPanel() {
  return null;
}
```

Or another minimal adapter if the `/maps` shell still requires a component instance before fullscreen handoff.

- [ ] **Step 4: Run the focused formal package frontend test**

```bash
node --test src/modules/maps/packages/china-passport-visa-map/frontend/passportVisaState.test.mjs
```

- [ ] **Step 5: Re-run shared helper tests to ensure the reused test logic still behaves identically**

```bash
node --test \
  test/lib/passportVisaLegendFilters.test.mjs \
  test/lib/passportVisaFlag.test.mjs \
  test/lib/passportVisaViewport.test.mjs \
  test/lib/passportVisaSvgStroke.test.mjs \
  test/lib/passportVisaOverlay.test.mjs \
  test/lib/passportVisaHoverCard.test.mjs \
  test/lib/passportVisaRiskMark.test.mjs \
  test/lib/passportVisaDetailInfo.test.mjs
```

### Task 4: Route `/maps` passport-visa selection to the migrated fullscreen package page

**Files:**
- Modify: `src/app/(shell)/maps/page.tsx`
- Modify: `src/app/(shell)/maps/maps-page.module.css`
- Modify: `src/modules/maps/index.ts`

- [ ] **Step 1: Add a failing assertion or regression test around package exports if needed**

```js
test('maps index re-exports passport visa fullscreen page dependencies', async () => {
  const maps = await import('@/modules/maps');
  assert.ok(maps.PassportVisaMapView);
});
```

- [ ] **Step 2: Change the `/maps` passport-visa branch so entering the package shows the test-equivalent fullscreen page**

```tsx
{activeTab === 'passport-visa' ? (
  <PassportVisaMapView />
) : ...}
```

The rendered experience after entry must match `test/app/passport-visa/page.tsx`, not the simplified current panel/map split.

- [ ] **Step 3: Update shell CSS only as needed to let the fullscreen passport-visa page render correctly**

Keep changes local to the passport-visa branch and avoid regressing the other map packages.

- [ ] **Step 4: Re-run the focused tests**

```bash
node --test src/modules/maps/packages/china-passport-visa-map/frontend/passportVisaState.test.mjs
```

### Task 5: Replace the simplified formal admin page and API with the test admin chain

**Files:**
- Modify: `src/modules/maps/packages/china-passport-visa-map/admin/ChinaPassportVisaMapAdminPage.tsx`
- Modify: `src/modules/maps/packages/china-passport-visa-map/admin/ChinaPassportVisaMapAdminPage.module.css`
- Modify: `src/modules/maps/packages/china-passport-visa-map/admin/index.ts`
- Create or modify package-local API handlers under `src/modules/maps/packages/china-passport-visa-map/api/`
- Create route entries under `src/app/api/admin/maps/passport-visa/*` if needed
- Reuse from test: `test/app/passport-visa-admin/page.tsx`
- Reuse from test: `test/app/passport-visa-admin/page.module.css`
- Reuse from test: `test/app/api/passport-visa/bootstrap/route.ts`
- Reuse from test: `test/app/api/passport-visa-admin/*`
- Reuse from test libs: `test/lib/passportVisaAdminRepository.ts`, `test/lib/passportVisaAdminValidation.ts`, `test/lib/passportVisaAdminSelection.ts`, `test/lib/passportVisaAdminTypes.ts`

- [ ] **Step 1: Add a failing admin-repository or validation test if the formal package lacks the expected API path**

```js
test('passport visa admin repository can read the formal countries source', async () => {
  const repository = createDefaultPassportVisaAdminFileRepository();
  const countries = await repository.listCountries();
  assert.ok(countries.length > 0);
});
```

- [ ] **Step 2: Keep the test admin page as the canonical admin UI and adapt it into the formal package admin page**

```tsx
export function ChinaPassportVisaMapAdminPage() {
  return <TestEquivalentPassportVisaAdminPage />;
}
```

- [ ] **Step 3: Move the test API handlers into formal package-owned route ownership**

```ts
export { GET } from '@/modules/maps/packages/china-passport-visa-map/api/bootstrap';
```

The logic should be shared, not forked.

- [ ] **Step 4: Re-run the admin and repository tests**

```bash
node --test \
  test/lib/passportVisaAdminRepository.test.mjs \
  test/lib/passportVisaAdminValidation.test.mjs \
  test/lib/passportVisaAdminSelection.test.mjs
```

### Task 6: Align formal package data sources and assets with the test implementation

**Files:**
- Modify: `src/modules/maps/packages/china-passport-visa-map/data/passportVisaCountries.ts`
- Modify: `src/modules/maps/packages/china-passport-visa-map/data/passportVisaLegend.ts`
- Modify: `src/modules/maps/packages/china-passport-visa-map/data/passportVisaRegionPolicy.ts`
- Verify: `public/maps/passport-visa/world.svg`
- Verify: `data/mfa-country-info.json`
- Verify: `scripts/mfaCountryScraper.mjs`
- Verify: `scripts/syncMfaCountrySections.mjs`

- [ ] **Step 1: Add a failing sync/data test if needed**

```bash
node --test scripts/syncMfaCountrySections.test.mjs
```

- [ ] **Step 2: Ensure the formal package reads the same country content and SVG assumptions as the current test version**

No alternate data model should remain in the formal package.

- [ ] **Step 3: Re-run the sync/data tests**

```bash
node --test \
  scripts/mfaCountryScraper.test.mjs \
  scripts/syncMfaCountrySections.test.mjs \
  src/modules/maps/packages/china-passport-visa-map/frontend/passportVisaState.test.mjs
```

### Task 7: Final verification for the full migration

**Files:**
- Verify only

- [ ] **Step 1: Run the full passport-visa verification set**

```bash
node --test \
  src/modules/maps/packages/china-passport-visa-map/frontend/passportVisaState.test.mjs \
  test/lib/passportVisaLegendFilters.test.mjs \
  test/lib/passportVisaFlag.test.mjs \
  test/lib/passportVisaViewport.test.mjs \
  test/lib/passportVisaSvgStroke.test.mjs \
  test/lib/passportVisaOverlay.test.mjs \
  test/lib/passportVisaHoverCard.test.mjs \
  test/lib/passportVisaRiskMark.test.mjs \
  test/lib/passportVisaDetailInfo.test.mjs \
  test/lib/passportVisaAdminRepository.test.mjs \
  test/lib/passportVisaAdminValidation.test.mjs \
  test/lib/passportVisaAdminSelection.test.mjs \
  scripts/mfaCountryScraper.test.mjs \
  scripts/syncMfaCountrySections.test.mjs
```

- [ ] **Step 2: Record any failures and fix them before claiming migration completion**

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/modules/maps/packages/china-passport-visa-map src/app/'(shell)'/maps src/app/api/admin/maps/passport-visa docs/superpowers/plans/2026-06-22-passport-visa-full-test-migration.md
git commit -m "feat: migrate passport visa map package to test implementation"
```
