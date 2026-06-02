# Footprint Layout Structure

## Current layout chain

1. Initial placement entry
- File: `src/app/(shell)/user/footprints/page.tsx`
- Function: `autoPlacePhotos(...)`
- Responsibility:
  - group unplaced photos by `placeKey`
  - build photo-cluster offsets
  - build pending group geometry
  - solve initial outer placement
  - freeze group label layout snapshot

2. Outer placement solver
- File: `src/components/footprintLayoutSolver.ts`
- Function: `solvePendingGroupPlacements(...)`
- Responsibility:
  - evaluate radial candidates
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
- Responsibility:
  - define label side rule
  - define label offset meaning
  - convert frozen layout snapshot into final label/line/photo geometry

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

### Preserved initial label spacing
- `labelOffset` is now frozen from solved geometry
- pending-group solved geometry is written back into `groupLayouts`
- existing-group resolved geometry is also written back into `groupLayouts`

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

### 2. Initial candidate generation is still photo-rect based
- Current behavior:
  - `page.tsx` builds initial pending geometry from offset photo bounds
- Risk:
  - if future label rules become more complex, pending-geometry creation should also be centralized

### 3. Group label overlap still depends on placement quality, not a dedicated label-only solver
- Current behavior:
  - whole-group solve protects the final combined rectangle
- Risk:
  - in dense center zones, visual readability may still be weak even without strict hard overlap

## Recommended next optimization direction

1. Move pending-group geometry creation into `localMapGroupGeometry.ts`
- Remove page-level ad hoc geometry assembly

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
