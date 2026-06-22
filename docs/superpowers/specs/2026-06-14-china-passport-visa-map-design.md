# China Passport Visa Map Design

## Background

The `maps` module already supports package registration, public package listing, and package-owned admin and frontend entries. We need a new world map package built from two user-provided files:

- `/Users/apple/Downloads/visa_map.xlsx`
- `/Users/apple/Downloads/world.svg`

The product goal is a China-passport travel visa map: users should be able to see visa status by country on a world map and inspect details per country.

## Goal

Add one new map package:

- package directory: `china-passport-visa-map`
- package slug: `passport-visa`
- display name: `中国护照签证地图`

This package should:

1. appear in `/maps`
2. render a world SVG colored by visa category
3. let users click a country to inspect its visa details
4. support panel-side search by country name
5. expose a lightweight admin page that summarizes the static dataset

## Non-Goals

- no database-backed editing flow in this round
- no Excel upload UI in this round
- no GIS engine or polygon conversion
- no public API endpoints beyond existing package listing
- no refactor of standard-map and rail-map behavior

## Source Data Strategy

The source of truth is the provided Excel sheet and world SVG.

The implementation will convert the Excel rows into package-local static TypeScript data and copy the SVG into a public asset path. Each country entry keeps:

- display names
- raw visa category text
- normalized visa display group
- fee
- requirement notes
- stay duration
- official visa URL
- Chinese embassy URL
- high-risk flags
- optional SVG country code mapping

Some Excel entries do not have a matching shape in the SVG. These entries stay searchable in the panel but are not colorable on the map.

## Data Model

Each country entry will include:

- `entrySlug`
- `mapCountryCode`
- `englishName`
- `chineseName`
- `visaCategoryRaw`
- `visaCategoryGroup`
- `visaFee`
- `visaRequirement`
- `stayDuration`
- `officialVisaUrl`
- `embassyUrl`
- `isHighRisk`
- `highRiskNote`

The normalized groups are:

- `visa-free`
- `visa-on-arrival`
- `e-visa`
- `conditional-entry`
- `visa-required`
- `special-restriction`

## UI Design

### Main View

The main view is an SVG world map inside the map frame. Countries are colored by visa group. The selected country gets a stronger stroke. High-risk countries get an extra alert stroke.

### Right Panel

The right panel includes:

- package intro
- search input
- visa group legend with counts
- selected country detail card
- search results when a query is present

### Admin View

The admin page is read-only in this round. It shows:

- source note
- total country count
- mappable country count
- unmappable entry count
- per-group counts

## Architecture

The package lives under `src/modules/maps/packages/china-passport-visa-map/` with:

- `admin/`
- `frontend/`
- `data/`
- `index.ts`

The frontend owns:

- static visa data
- SVG map rendering
- panel search and selection state

The `/maps` page will add a dedicated branch for the new package in this round. That keeps the change local and avoids refactoring unrelated map packages while still landing the feature.

## Risks

### Name-to-SVG Mapping

The Excel file uses English country names while the SVG uses mostly ISO-like two-letter IDs. Manual aliases are required for several entries.

### Duplicate Names

`Saint Martin` appears twice in Excel and must be split into distinct mapped entries instead of being de-duplicated by English name.

### Partial SVG Coverage

Some small island territories in Excel do not have a corresponding path in the SVG. These remain panel-only entries.
