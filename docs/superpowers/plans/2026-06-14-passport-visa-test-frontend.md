# Passport Visa Test Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-screen China passport visa map test page inside the local `test/` workspace, with the map as the main visual, a bottom tool strip, a right-bottom legend, and a right-side details drawer.

**Architecture:** Keep this phase frontend-only and local-only inside `test/`. Reuse the existing world SVG and a reduced local visa seed derived from the main workspace shape, then render the SVG directly in the page with grouped display colors and click-driven drawer state.

**Tech Stack:** Next.js App Router in `test/`, React, TypeScript, CSS Modules, local static SVG asset, page-local state.

---

## File Structure

- Create: `test/app/passport-visa/page.tsx`
- Create: `test/app/passport-visa/page.module.css`
- Create: `test/lib/passportVisaSeed.ts`
- Create: `test/public/maps/passport-visa/world.svg`
- Modify: `test/app/page.tsx`

## Task 1: Prepare local seed and asset

**Files:**
- Create: `test/lib/passportVisaSeed.ts`
- Create: `test/public/maps/passport-visa/world.svg`

- [ ] Copy the world SVG into the test workspace public directory
- [ ] Add a local seed with enough representative countries to validate:
  - `免签`
  - `落地签 / 电子签`
  - `需签证`
  - `无数据`
  - high-risk styling

## Task 2: Build the full-screen page

**Files:**
- Create: `test/app/passport-visa/page.tsx`
- Create: `test/app/passport-visa/page.module.css`

- [ ] Render a full-screen world SVG page
- [ ] Place the tool/data strip at the bottom
- [ ] Place the legend in the right-bottom corner
- [ ] Keep no-data countries gray-white and non-interactive
- [ ] Slide in a right-side drawer after clicking an interactive country

## Task 3: Add local entry point

**Files:**
- Modify: `test/app/page.tsx`

- [ ] Add a home-page link to `/passport-visa`

## Task 4: Verify

**Files:**
- No code changes expected

- [ ] Run `cd test && npm run build`
- [ ] If build fails, report exact error and fix it before claiming completion
