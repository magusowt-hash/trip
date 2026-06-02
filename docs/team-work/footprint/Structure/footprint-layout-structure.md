# Footprint Layout Structure

## Current layout chain

1. Initial placement entry
- File: `src/app/(shell)/user/footprints/page.tsx`
- Function: `autoPlacePhotos(...)`
- Responsibility:
  - group unplaced photos by `placeKey`
  - build photo-cluster offsets
  - convert offsets into one `collisionGeometry` per group
  - expand existing groups in place when the same place receives more photos
  - pass only `PendingPlaceGroup[]` into the outer solver
  - freeze final label layout snapshot after placement is done

2. Outer placement solver
- File: `src/components/footprintLayoutSolver.ts`
- Function: `solvePendingGroupPlacements(...)`
- Responsibility:
  - consume pending groups only, without page-level wrapper logic
  - evaluate radial candidates
  - recompute whole-group geometry for every candidate position
  - recompute `labelSide` from the candidate center, not from precomputed state
  - reject map overlap
  - reject line crossing
  - reject whole-group overlap
  - return final center and chosen whole-group geometry

3. Label geometry source of truth
- File: `src/components/localMapGroupGeometry.ts`
- Core functions:
  - `buildGroupGeometryFromPhotoRect(...)`
  - `buildGroupGeometry(...)`
  - `createGroupLayoutSnapshot(...)`
  - `buildGroupGeometryFromLayout(...)`
  - `resolveGroupLabelLayouts(...)`
- Responsibility:
  - define label side rule
  - define label offset meaning
  - convert frozen layout snapshot into final label/line/photo geometry
  - run one-time label-offset solve after group placement is already fixed

4. Runtime rendering
- Files:
  - `src/components/OuterFrameCanvas.tsx`
  - `src/components/LineCanvas.tsx`
  - `src/components/OuterFrame.tsx`
- Responsibility:
  - consume `groupLayouts`
  - render labels, anchors, lines and fit-view bounds
  - do not run whole-group auto layout again

## Frozen layout data

Current frozen label state:

- `placeKey`
- `labelSide`
- `labelOffset`

This data is stored in page state as `groupLayouts` and is now the only label-layout input for runtime rendering.

## Simplified ownership

Current ownership is intentionally single-path:

- `page.tsx`
  - prepares grouped input
  - applies solved centers back to photos
  - stores frozen `groupLayouts`
- `footprintLayoutSolver.ts`
  - decides initial group center
  - decides candidate-synchronous label side
- `localMapGroupGeometry.ts`
  - defines group bounds
  - defines label bounds
  - defines final frozen rendering geometry

There should no longer be parallel page-level placement wrappers or extra render-only geometry branches.

## Bugs found

### 1. Label logic was split across multiple layers
- Before:
  - page built snapshots
  - canvas rebuilt geometry
  - line canvas rebuilt geometry again
  - outer frame fit-view used another path
- Result:
  - the same group could produce slightly different label bounds in different places
  - visual overlap remained even after initial placement looked legal

### 2. Initial solved label spacing was not fully preserved
- Before:
  - initial solve could choose a legal whole-group geometry
  - runtime only preserved `labelSide`
  - label distance fell back to a default near-photo gap
- Result:
  - labels collapsed back toward photos and into neighbor groups

### 3. Existing groups and pending groups were not fully aligned
- Before:
  - some paths used solved geometry
  - some paths rebuilt geometry from photos only
- Result:
  - existing groups could visually drift away from the label geometry assumed during placement

### 4. Fit-view and map-avoidance did not always use frozen label geometry
- Before:
  - viewport and map clamp could use geometry not derived from frozen layout snapshot
- Result:
  - view bounds and map collision handling could disagree with final rendered labels

## Fixes applied

### Unified label structure
- `GroupLayoutSnapshot` moved into `src/components/localMapGroupGeometry.ts`
- `createGroupLayoutSnapshot(...)` moved into the same module
- `buildGroupGeometryFromLayout(...)` added as the single runtime entry
- `resolveGroupLabelLayouts(...)` added as the single one-time label-offset solver

### Preserved initial label spacing
- `labelOffset` is now frozen from solved geometry
- pending-group solved geometry is written back into `groupLayouts`
- existing-group resolved geometry is also written back into `groupLayouts`
- frozen layouts are now rebuilt through the dedicated label-offset solver instead of simple geometry replay

### Label solve is now a dedicated stage
- Stage 1:
  - solve photo-group outer placement
  - each placement candidate now computes its own label geometry at the same time
  - label side is no longer pre-frozen before candidate evaluation
- Stage 2:
  - keep `labelSide` fixed
  - solve only `labelOffset`
  - minimize label-photo and label-label conflicts
- Runtime:
  - consume frozen snapshot only

### Unified runtime consumers
- `OuterFrameCanvas.tsx` now renders labels through `buildGroupGeometryFromLayout(...)`
- `LineCanvas.tsx` now resolves anchors through `buildGroupGeometryFromLayout(...)`
- `OuterFrame.tsx` fit-view bounds now use `buildGroupGeometryFromLayout(...)`
- `OuterFrameCanvas.tsx` map clamp now uses `buildGroupGeometryFromLayout(...)`

## Remaining structural risks

### 1. Initial label snapshot rebuild after manual drag
- Current behavior:
  - manual drag keeps existing `labelSide` and `labelOffset`
  - geometry updates around moved photos
- Risk:
  - if a user drags a dense group into a tighter area, overlap may remain because no second label-avoidance solve is run

### 2. Initial candidate generation is still page-level
- Current behavior:
  - `page.tsx` still converts offset arrays into `collisionGeometry`
- Risk:
  - if future group-shape rules become more complex, that conversion should also move into `localMapGroupGeometry.ts`

### 3. Group label overlap still depends on placement quality, not a dedicated label-only solver
- Current behavior:
  - whole-group solve protects the final combined rectangle
- Risk:
  - in dense center zones, visual readability may still be weak even without strict hard overlap

## Recommended next optimization direction

1. Move pending-group geometry creation into `localMapGroupGeometry.ts`
- Remove the last page-level offset-to-geometry helper

2. Add explicit label clearance tiers
- Example:
  - center dense zone: larger minimum `labelOffset`
  - outer sparse zone: smaller minimum `labelOffset`

3. Add dedicated label readability scoring during initial solve
- Penalize:
  - label-to-neighbor-photo near misses
  - label-to-neighbor-label near stacking
  - label staying too close to map center in dense zones

4. Keep runtime frozen
- Any future optimization should still run only during initial mapping or explicit relayout
- Rendering must remain a pure consumer of frozen layout snapshots
