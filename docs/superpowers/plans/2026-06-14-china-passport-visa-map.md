# China Passport Visa Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new `china-passport-visa-map` package that renders a world visa map for Chinese passports from the provided Excel and SVG files.

**Architecture:** Keep the data package-local and static in this round. Convert Excel rows into a TypeScript data module, render the SVG world map in the package frontend, and connect a right-panel controller for search, selection, and legend stats. Add a lightweight read-only admin page for package visibility and dataset inspection.

**Tech Stack:** Next.js App Router, React, TypeScript, existing maps package registry, package-local CSS modules, Node test runner for pure helper tests.

---

## File Structure

- Create: `src/modules/maps/packages/china-passport-visa-map/index.ts`
- Create: `src/modules/maps/packages/china-passport-visa-map/admin/index.ts`
- Create: `src/modules/maps/packages/china-passport-visa-map/admin/ChinaPassportVisaMapAdminPage.tsx`
- Create: `src/modules/maps/packages/china-passport-visa-map/admin/ChinaPassportVisaMapAdminPage.module.css`
- Create: `src/modules/maps/packages/china-passport-visa-map/frontend/index.ts`
- Create: `src/modules/maps/packages/china-passport-visa-map/frontend/ChinaPassportVisaMapRightPanel.tsx`
- Create: `src/modules/maps/packages/china-passport-visa-map/frontend/ChinaPassportVisaMapRightPanel.module.css`
- Create: `src/modules/maps/packages/china-passport-visa-map/frontend/PassportVisaMapView.tsx`
- Create: `src/modules/maps/packages/china-passport-visa-map/frontend/PassportVisaMapView.module.css`
- Create: `src/modules/maps/packages/china-passport-visa-map/frontend/passportVisaState.ts`
- Create: `src/modules/maps/packages/china-passport-visa-map/frontend/passportVisaState.test.mjs`
- Create: `src/modules/maps/packages/china-passport-visa-map/data/passportVisaTypes.ts`
- Create: `src/modules/maps/packages/china-passport-visa-map/data/passportVisaLegend.ts`
- Create: `src/modules/maps/packages/china-passport-visa-map/data/passportVisaCountries.ts`
- Create: `public/maps/passport-visa/world.svg`
- Modify: `src/modules/maps/core/registry/map-packages.ts`
- Modify: `src/modules/maps/index.ts`
- Modify: `src/app/(shell)/maps/page.tsx`

## Task 1: Add pure visa data helpers and tests

**Files:**
- Create: `src/modules/maps/packages/china-passport-visa-map/frontend/passportVisaState.ts`
- Create: `src/modules/maps/packages/china-passport-visa-map/frontend/passportVisaState.test.mjs`
- Create: `src/modules/maps/packages/china-passport-visa-map/data/passportVisaTypes.ts`
- Create: `src/modules/maps/packages/china-passport-visa-map/data/passportVisaLegend.ts`
- Create: `src/modules/maps/packages/china-passport-visa-map/data/passportVisaCountries.ts`

- [ ] Write a failing `node:test` file for:
  - category counts summing to all entries
  - `Saint Martin` splitting into `MF` and `SX`
  - unmappable islands remaining searchable
  - query filtering by Chinese and English names
- [ ] Run `node --experimental-strip-types --test src/modules/maps/packages/china-passport-visa-map/frontend/passportVisaState.test.mjs`
- [ ] Implement minimal pure helpers and generated static data
- [ ] Re-run the same test command until it passes

## Task 2: Register the new map package

**Files:**
- Create: `src/modules/maps/packages/china-passport-visa-map/index.ts`
- Modify: `src/modules/maps/core/registry/map-packages.ts`
- Modify: `src/modules/maps/index.ts`
- Create: `src/modules/maps/packages/china-passport-visa-map/frontend/index.ts`
- Create: `src/modules/maps/packages/china-passport-visa-map/admin/index.ts`

- [ ] Add the package metadata with:
  - `slug: 'passport-visa'`
  - `packageName: 'china-passport-visa-map'`
  - `name: '中国护照签证地图'`
- [ ] Wire admin and frontend exports into the registry

## Task 3: Build the package frontend

**Files:**
- Create: `src/modules/maps/packages/china-passport-visa-map/frontend/PassportVisaMapView.tsx`
- Create: `src/modules/maps/packages/china-passport-visa-map/frontend/PassportVisaMapView.module.css`
- Create: `src/modules/maps/packages/china-passport-visa-map/frontend/ChinaPassportVisaMapRightPanel.tsx`
- Create: `src/modules/maps/packages/china-passport-visa-map/frontend/ChinaPassportVisaMapRightPanel.module.css`

- [ ] Fetch and render the world SVG from `public/maps/passport-visa/world.svg`
- [ ] Color paths by `visaCategoryGroup`
- [ ] Support click-to-select by SVG path ID
- [ ] Render legend counts and selected-country details in the right panel

## Task 4: Mount the package in `/maps`

**Files:**
- Modify: `src/app/(shell)/maps/page.tsx`

- [ ] Add a package-local controller hook usage
- [ ] Render the passport visa map view in the left map frame when `activeTab === 'passport-visa'`
- [ ] Render the passport visa right panel in the right column for the same tab

## Task 5: Add a lightweight admin summary page

**Files:**
- Create: `src/modules/maps/packages/china-passport-visa-map/admin/ChinaPassportVisaMapAdminPage.tsx`
- Create: `src/modules/maps/packages/china-passport-visa-map/admin/ChinaPassportVisaMapAdminPage.module.css`

- [ ] Show package source note
- [ ] Show total and mappable counts
- [ ] Show per-group statistics
- [ ] Keep the page read-only in this round

## Task 6: Verify

**Files:**
- No code changes expected

- [ ] Run `node --experimental-strip-types --test src/modules/maps/packages/china-passport-visa-map/frontend/passportVisaState.test.mjs`
- [ ] Run `git diff --stat`
- [ ] Report any unverified items explicitly if full app build cannot run in the current environment
