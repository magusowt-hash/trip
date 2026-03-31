# Trip Web: Figma Structure Mapping

Purpose: map Figma sections to code directories so design and development stay aligned.

## Top-level mapping (Figma -> code)

- `00_Design_System`
  - `src/styles/tokens.css`
  - `src/constants/designSystem.ts`
- `01_Foundations`
  - `src/styles/base.css`
  - `src/app/globals.css`
- `02_Components` (component library, key)
  - `src/components/ui/*` (primitives: Button / Input / Modal)
  - `src/components/feedback/*` (page-level states: PageState)
  - `src/components/layout/*` (page skeleton: Header / BottomBar / Footer)
  - `src/modules/post/*` (feed card: PostCard + PostDetailModal)
  - `src/modules/recommend/*` (RecommendCard)
  - `src/modules/*/components/*` (feature components: e.g. itinerary ItineraryCard / DayTabs / Timeline)
- `03_Pages`
  - `src/app/*/page.tsx`
- `04_Flows`
  - maintained in Figma; implemented in code via routes / page state
  - main chain: `Home -> Detail -> Itinerary`
- `05_Prototypes`
  - implemented progressively in code (click, scroll, state transitions)
- `06_Assets`
  - recommended: `public/` grouped as `Images/Icons/Illustrations`

## Component rules

- Components must support variants/states (example: Button: primary / secondary / ghost / disabled)
- Reuse shared components; avoid duplicating styling inside pages
- Page state naming must follow `Page_State` (example: `Home_Default`, `Home_Loading`)

## Current status (update after each iteration)

- Pages: Home / Post_Detail / Itinerary
- Components: Button / Input / Modal; cards; navigation skeleton; itinerary module components
- Design tokens wired through `src/styles` and global CSS

