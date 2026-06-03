# Footprint Layout Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce footprint layout preparation cost by preventing corridor crowding earlier and shrinking the expensive global refinement pass.

**Architecture:** Keep the current solver pipeline, but move crowding avoidance into candidate ordering and initial placement priority. Retain a much smaller corridor cleanup pass as a guardrail instead of the main optimization engine.

**Tech Stack:** TypeScript, Node test runner via `tsx --test`

---

### Task 1: Add a failing performance-oriented behavior test

**Files:**
- Modify: `src/components/footprintLayoutCorridorRisk.test.ts`

- [ ] **Step 1: Write a failing test**
Add a test that exercises the crowded southern scenario and asserts the lightweight cleanup inputs stay bounded, such as limiting the number of groups/candidates examined by the corridor cleanup helper once instrumentation is added.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx tsx --test src/components/footprintLayoutCorridorRisk.test.ts`
Expected: FAIL because the current implementation still scans all groups / too many candidates.

- [ ] **Step 3: Implement minimal instrumentation support in solver**
Expose small internal counters or helper outputs only as needed for the test, keeping them local to the solver module.

- [ ] **Step 4: Re-run test to verify it passes**
Run: `npx tsx --test src/components/footprintLayoutCorridorRisk.test.ts`
Expected: PASS.

### Task 2: Front-load crowding avoidance in ordering and candidate selection

**Files:**
- Modify: `src/components/footprintLayoutSolver.ts`
- Test: `src/components/footprintLayoutCorridorRisk.test.ts`

- [ ] **Step 1: Update group ordering inputs**
Incorporate sector density / candidate narrowness into placement order so harder groups are placed earlier.

- [ ] **Step 2: Tighten candidate layering**
Keep only targeted dense-sector expansion and ensure candidate ordering favors safer, less crowded corridors first.

- [ ] **Step 3: Run focused tests**
Run: `npx tsx --test src/components/footprintLayoutCorridorRisk.test.ts src/components/footprintLayoutSolver.test.ts`
Expected: PASS.

### Task 3: Shrink the expensive cleanup pass

**Files:**
- Modify: `src/components/footprintLayoutSolver.ts`
- Test: `src/components/footprintLayoutCorridorRisk.test.ts`

- [ ] **Step 1: Restrict cleanup trigger and scope**
Only invoke corridor cleanup when risk remains after initial optimization; limit it to top-risk groups and a capped number of leading candidates.

- [ ] **Step 2: Add early-stop behavior**
Stop cleanup as soon as an iteration yields no improvement.

- [ ] **Step 3: Run corridor and regression tests**
Run: `npx tsx --test src/components/footprintLayoutCorridorRisk.test.ts src/components/footprintCollisionSpacing.test.ts src/components/footprintLayoutSolver.test.ts src/components/footprintLabelCandidates.test.ts src/components/footprintLayoutHeuristics.test.ts`
Expected: PASS.

### Task 4: Verify behavior and capture final state

**Files:**
- Modify: `src/components/footprintLayoutSolver.ts`
- Test: `src/components/footprintLayoutCorridorRisk.test.ts`

- [ ] **Step 1: Remove any temporary-only instrumentation not needed by tests**
Keep only stable helpers or metrics that are useful for maintenance.

- [ ] **Step 2: Run final test suite**
Run: `npx tsx --test src/components/footprintLayoutCorridorRisk.test.ts src/components/footprintCollisionSpacing.test.ts src/components/footprintLayoutSolver.test.ts src/components/footprintLabelCandidates.test.ts src/components/footprintLayoutHeuristics.test.ts`
Expected: PASS.
