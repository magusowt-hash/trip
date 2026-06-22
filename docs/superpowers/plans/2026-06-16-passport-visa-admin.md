# Passport Visa Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a test-stage admin console for passport visa data that directly edits data and immediately affects the `/passport-visa` test page, while keeping a clear storage boundary that can later swap from files to a database.

**Architecture:** Move editable data into `test/data/passport-visa/*.json`, add a repository layer plus validation/mapping utilities in `test/lib`, expose CRUD route handlers under `test/app/api/passport-visa-admin`, and build a `test/app/passport-visa-admin` UI for countries, scenarios, and theme configuration. The front-end test page continues to render the same behavior, but reads from the new data layer instead of hardcoded TypeScript source arrays.

**Tech Stack:** Next.js App Router, React 18, TypeScript, Node `fs/promises`, route handlers, node:test regression tests.

---

## File Map

### Data files

- Create: `test/data/passport-visa/countries.json`
- Create: `test/data/passport-visa/scenarios.json`
- Create: `test/data/passport-visa/theme.json`

Responsibilities:

- `countries.json`: editable country detail records for the detail drawer and base `displayGroup`
- `scenarios.json`: editable visa scenario definitions
- `theme.json`: editable map/detail theme colors

### Library files

- Create: `test/lib/passportVisaAdminTypes.ts`
- Create: `test/lib/passportVisaAdminValidation.ts`
- Create: `test/lib/passportVisaAdminRepository.ts`
- Create: `test/lib/passportVisaTheme.ts`
- Modify: `test/lib/passportVisaSeed.ts`
- Modify: `test/lib/passportVisaScenarioDefinitions.ts`
- Modify: `test/lib/passportVisaScenarios.ts`

Responsibilities:

- `passportVisaAdminTypes.ts`: shared runtime-facing data types for admin/data/repository layers
- `passportVisaAdminValidation.ts`: validation helpers for countries, scenarios, theme
- `passportVisaAdminRepository.ts`: file-backed read/write repository
- `passportVisaTheme.ts`: theme loader and defaults
- `passportVisaSeed.ts`: consume `countries.json` instead of inline hardcoded data
- `passportVisaScenarioDefinitions.ts`: consume `scenarios.json` instead of inline hardcoded data
- `passportVisaScenarios.ts`: continue applying scenarios based on loaded definitions

### API files

- Create: `test/app/api/passport-visa-admin/countries/route.ts`
- Create: `test/app/api/passport-visa-admin/countries/[code]/route.ts`
- Create: `test/app/api/passport-visa-admin/scenarios/route.ts`
- Create: `test/app/api/passport-visa-admin/scenarios/[id]/route.ts`
- Create: `test/app/api/passport-visa-admin/theme/route.ts`

Responsibilities:

- Countries collection CRUD
- Single-country update/delete
- Scenario collection CRUD
- Single-scenario update/delete
- Theme read/update

### UI files

- Create: `test/app/passport-visa-admin/page.tsx`
- Create: `test/app/passport-visa-admin/page.module.css`

Responsibilities:

- Three admin sections: Countries, Scenarios, Theme
- Search/filter/list/edit interactions
- Save actions against admin API
- Immediate persistence feedback

### Docs/tests

- Modify: `docs/guides/passport-visa-map-maintenance.md`
- Create: `test/lib/passportVisaAdminValidation.test.mjs`
- Create: `test/lib/passportVisaAdminRepository.test.mjs`
- Modify: `test/lib/passportVisaScenarios.test.mjs`
- Modify: `test/lib/passportVisaLegendFilters.test.mjs`

Responsibilities:

- Doc the new storage layout and admin maintenance path
- Validate repository and data rules
- Verify behavior stays unchanged after data-source migration

## Task 1: Create Editable Data Files

**Files:**
- Create: `test/data/passport-visa/countries.json`
- Create: `test/data/passport-visa/scenarios.json`
- Create: `test/data/passport-visa/theme.json`
- Modify: `test/lib/passportVisaScenarios.test.mjs`

- [ ] **Step 1: Write the failing test for unified scenario data shape**

Add this test near the top of `test/lib/passportVisaScenarios.test.mjs`:

```js
test('scenario definitions expose editable country code arrays', () => {
  for (const scenario of passportVisaScenarioDefinitions) {
    assert.equal(typeof scenario.id, 'string');
    assert.equal(typeof scenario.label, 'string');
    assert.ok(Array.isArray(scenario.countryCodes));
    assert.ok(scenario.countryCodes.length > 0);
  }
});
```

- [ ] **Step 2: Run test to verify current behavior baseline**

Run:

```bash
node --test /Users/apple/Desktop/codex/trip/test/lib/passportVisaScenarios.test.mjs
```

Expected:

- PASS, confirming existing scenario shape is stable before migration

- [ ] **Step 3: Create `scenarios.json` from current confirmed scenario data**

Create `test/data/passport-visa/scenarios.json` with the current six scenarios and country code arrays. Example structure:

```json
[
  {
    "id": "schengen",
    "label": "申根签",
    "countryCodes": ["AT", "BE", "BG"]
  }
]
```

Use the full current scenario data, not the shortened example.

- [ ] **Step 4: Create `theme.json` from current page theme**

Create `test/data/passport-visa/theme.json`:

```json
{
  "label": "沙棕",
  "visaFree": "#D4A52A",
  "arrivalOrEVisa": "#F0DEBF",
  "visaRequired": "#8B5E3C",
  "noData": "#F4F3F0",
  "stroke": "#FFFDF9",
  "accentStrong": "#6F4B2F"
}
```

- [ ] **Step 5: Create `countries.json` from current passport visa seed**

Create `test/data/passport-visa/countries.json` by copying the current records from `test/lib/passportVisaSeed.ts` into plain JSON array form. Preserve all existing fields and values exactly.

- [ ] **Step 6: Commit**

```bash
git add /Users/apple/Desktop/codex/trip/test/data/passport-visa /Users/apple/Desktop/codex/trip/test/lib/passportVisaScenarios.test.mjs
git commit -m "feat: add editable passport visa data files"
```

## Task 2: Add Shared Admin Types And Validation

**Files:**
- Create: `test/lib/passportVisaAdminTypes.ts`
- Create: `test/lib/passportVisaAdminValidation.ts`
- Create: `test/lib/passportVisaAdminValidation.test.mjs`

- [ ] **Step 1: Write the failing validation tests**

Create `test/lib/passportVisaAdminValidation.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validatePassportVisaCountryRecord,
  validatePassportVisaScenarioRecord,
  validatePassportVisaThemeRecord,
} from './passportVisaAdminValidation.ts';

test('rejects duplicate scenario country codes', () => {
  assert.throws(
    () => validatePassportVisaScenarioRecord({
      id: 'demo',
      label: '演示',
      countryCodes: ['MX', 'MX'],
    }),
    /duplicate/i,
  );
});

test('rejects invalid theme color values', () => {
  assert.throws(
    () => validatePassportVisaThemeRecord({
      label: 'bad',
      visaFree: 'gold',
      arrivalOrEVisa: '#ffffff',
      visaRequired: '#000000',
      noData: '#eeeeee',
      stroke: '#ffffff',
      accentStrong: '#123456',
    }),
    /hex/i,
  );
});

test('rejects invalid country urls', () => {
  assert.throws(
    () => validatePassportVisaCountryRecord({
      mapCountryCode: 'MX',
      englishName: 'Mexico',
      chineseName: '墨西哥',
      displayGroup: 'visa-free',
      rawLabel: '免签',
      visaFee: '0',
      visaRequirement: '',
      stayDuration: '180天',
      officialVisaUrl: 'not-a-url',
      embassyUrl: 'https://example.com',
    }),
    /officialVisaUrl/i,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test /Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminValidation.test.mjs
```

Expected:

- FAIL because validation module does not exist yet

- [ ] **Step 3: Create shared admin data types**

Create `test/lib/passportVisaAdminTypes.ts` with the exact types:

```ts
import type { PassportVisaDisplayGroup } from './passportVisaSeed';

export type PassportVisaCountryRecord = {
  mapCountryCode: string;
  englishName: string;
  chineseName: string;
  displayGroup: PassportVisaDisplayGroup;
  rawLabel: string;
  visaFee: string;
  visaRequirement: string;
  stayDuration: string;
  officialVisaUrl: string;
  embassyUrl: string;
  isHighRisk?: boolean;
  highRiskNote?: string;
};

export type PassportVisaScenarioRecord = {
  id: string;
  label: string;
  countryCodes: string[];
};

export type PassportVisaThemeRecord = {
  label: string;
  visaFree: string;
  arrivalOrEVisa: string;
  visaRequired: string;
  noData: string;
  stroke: string;
  accentStrong: string;
};
```

- [ ] **Step 4: Implement minimal validation helpers**

Create `test/lib/passportVisaAdminValidation.ts` with:

```ts
import type {
  PassportVisaCountryRecord,
  PassportVisaScenarioRecord,
  PassportVisaThemeRecord,
} from './passportVisaAdminTypes';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function validateUrl(value: string, fieldName: string) {
  try {
    new URL(value);
  } catch {
    throw new Error(`${fieldName} must be a valid URL`);
  }
}

export function validatePassportVisaCountryRecord(record: PassportVisaCountryRecord) {
  assert(record.mapCountryCode, 'mapCountryCode is required');
  assert(record.englishName, 'englishName is required');
  assert(record.chineseName, 'chineseName is required');
  validateUrl(record.officialVisaUrl, 'officialVisaUrl');
  validateUrl(record.embassyUrl, 'embassyUrl');
}

export function validatePassportVisaScenarioRecord(record: PassportVisaScenarioRecord) {
  assert(record.id, 'scenario id is required');
  assert(record.label, 'scenario label is required');
  assert(record.countryCodes.length > 0, 'scenario countryCodes must not be empty');
  assert(
    new Set(record.countryCodes).size === record.countryCodes.length,
    'scenario countryCodes must not contain duplicate values',
  );
}

export function validatePassportVisaThemeRecord(record: PassportVisaThemeRecord) {
  for (const key of ['visaFree', 'arrivalOrEVisa', 'visaRequired', 'noData', 'stroke', 'accentStrong'] as const) {
    assert(HEX_COLOR_PATTERN.test(record[key]), `${key} must be a valid hex color`);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
node --test /Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminValidation.test.mjs
```

Expected:

- PASS

- [ ] **Step 6: Commit**

```bash
git add /Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminTypes.ts /Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminValidation.ts /Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminValidation.test.mjs
git commit -m "feat: add passport visa admin validation"
```

## Task 3: Add File-Backed Repository

**Files:**
- Create: `test/lib/passportVisaAdminRepository.ts`
- Create: `test/lib/passportVisaAdminRepository.test.mjs`

- [ ] **Step 1: Write the failing repository test**

Create `test/lib/passportVisaAdminRepository.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPassportVisaAdminFileRepository,
} from './passportVisaAdminRepository.ts';

test('repository reads scenarios from the configured json file', async () => {
  const repository = createPassportVisaAdminFileRepository({
    countriesPath: new URL('../fixtures/countries.json', import.meta.url),
    scenariosPath: new URL('../fixtures/scenarios.json', import.meta.url),
    themePath: new URL('../fixtures/theme.json', import.meta.url),
  });

  const scenarios = await repository.listScenarios();
  assert.equal(Array.isArray(scenarios), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test /Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminRepository.test.mjs
```

Expected:

- FAIL because repository file does not exist yet

- [ ] **Step 3: Implement repository contract**

Create `test/lib/passportVisaAdminRepository.ts` with:

```ts
import fs from 'node:fs/promises';

import type {
  PassportVisaCountryRecord,
  PassportVisaScenarioRecord,
  PassportVisaThemeRecord,
} from './passportVisaAdminTypes';

type PassportVisaAdminFileRepositoryOptions = {
  countriesPath: URL;
  scenariosPath: URL;
  themePath: URL;
};

async function readJsonFile<T>(path: URL): Promise<T> {
  const raw = await fs.readFile(path, 'utf8');
  return JSON.parse(raw) as T;
}

async function writeJsonFile(path: URL, value: unknown) {
  await fs.writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function createPassportVisaAdminFileRepository(options: PassportVisaAdminFileRepositoryOptions) {
  return {
    async listCountries() {
      return readJsonFile<PassportVisaCountryRecord[]>(options.countriesPath);
    },
    async saveCountries(records: PassportVisaCountryRecord[]) {
      await writeJsonFile(options.countriesPath, records);
    },
    async listScenarios() {
      return readJsonFile<PassportVisaScenarioRecord[]>(options.scenariosPath);
    },
    async saveScenarios(records: PassportVisaScenarioRecord[]) {
      await writeJsonFile(options.scenariosPath, records);
    },
    async getTheme() {
      return readJsonFile<PassportVisaThemeRecord>(options.themePath);
    },
    async saveTheme(record: PassportVisaThemeRecord) {
      await writeJsonFile(options.themePath, record);
    },
  };
}
```

- [ ] **Step 4: Run test to verify repository module loads**

Run:

```bash
node --test /Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminRepository.test.mjs
```

Expected:

- Still FAIL because fixture files do not exist yet

- [ ] **Step 5: Replace fixture paths with real data files in test**

Update the test to point to:

```js
new URL('../data/passport-visa/countries.json', import.meta.url)
new URL('../data/passport-visa/scenarios.json', import.meta.url)
new URL('../data/passport-visa/theme.json', import.meta.url)
```

- [ ] **Step 6: Run test to verify it passes**

Run:

```bash
node --test /Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminRepository.test.mjs
```

Expected:

- PASS

- [ ] **Step 7: Commit**

```bash
git add /Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminRepository.ts /Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminRepository.test.mjs
git commit -m "feat: add passport visa admin repository"
```

## Task 4: Migrate Front-End Data Loaders To JSON Source

**Files:**
- Modify: `test/lib/passportVisaSeed.ts`
- Modify: `test/lib/passportVisaScenarioDefinitions.ts`
- Create: `test/lib/passportVisaTheme.ts`
- Modify: `test/app/passport-visa/page.tsx`
- Test: `test/lib/passportVisaScenarios.test.mjs`
- Test: `test/lib/passportVisaLegendFilters.test.mjs`

- [ ] **Step 1: Write the failing test for country data import stability**

Add to `test/lib/passportVisaLegendFilters.test.mjs`:

```js
test('country seed remains populated after moving to json source', async () => {
  const { passportVisaSeed } = await import('./passportVisaSeed.ts');
  assert.ok(passportVisaSeed.length > 200);
});
```

- [ ] **Step 2: Run the scenario and legend tests**

Run:

```bash
node --test /Users/apple/Desktop/codex/trip/test/lib/passportVisaScenarios.test.mjs /Users/apple/Desktop/codex/trip/test/lib/passportVisaLegendFilters.test.mjs
```

Expected:

- PASS before migration

- [ ] **Step 3: Convert `passportVisaSeed.ts` into a typed JSON bridge**

Replace hardcoded records in `test/lib/passportVisaSeed.ts` with:

```ts
import countries from '../data/passport-visa/countries.json';

export type PassportVisaDisplayGroup =
  | 'region-neutral'
  | 'visa-free'
  | 'arrival-or-evisa'
  | 'visa-required';

export type PassportVisaSeedItem = {
  mapCountryCode: string;
  englishName: string;
  chineseName: string;
  displayGroup: PassportVisaDisplayGroup;
  rawLabel: string;
  visaFee: string;
  visaRequirement: string;
  stayDuration: string;
  officialVisaUrl: string;
  embassyUrl: string;
  isHighRisk?: boolean;
  highRiskNote?: string;
};

export const passportVisaSeed = countries as PassportVisaSeedItem[];
```

Preserve the existing palette exports already used elsewhere.

- [ ] **Step 4: Convert scenario definitions into a typed JSON bridge**

Update `test/lib/passportVisaScenarioDefinitions.ts`:

```ts
import scenarios from '../data/passport-visa/scenarios.json';

export const passportVisaScenarioDefinitions = scenarios as readonly {
  id: string;
  label: string;
  countryCodes: string[];
}[];

export type PassportVisaScenarioId = typeof passportVisaScenarioDefinitions[number]['id'];
```

Then tighten types as needed to preserve the current scenario consumer API.

- [ ] **Step 5: Extract theme config**

Create `test/lib/passportVisaTheme.ts`:

```ts
import theme from '../data/passport-visa/theme.json';

export type PassportVisaTheme = typeof theme;

export const activePassportVisaTheme = theme;
```

Update `test/app/passport-visa/page.tsx` to import and use `activePassportVisaTheme` instead of hardcoding the theme object.

- [ ] **Step 6: Run tests to verify no behavior change**

Run:

```bash
node --test /Users/apple/Desktop/codex/trip/test/lib/passportVisaScenarios.test.mjs /Users/apple/Desktop/codex/trip/test/lib/passportVisaLegendFilters.test.mjs
```

Expected:

- PASS

- [ ] **Step 7: Commit**

```bash
git add /Users/apple/Desktop/codex/trip/test/lib/passportVisaSeed.ts /Users/apple/Desktop/codex/trip/test/lib/passportVisaScenarioDefinitions.ts /Users/apple/Desktop/codex/trip/test/lib/passportVisaTheme.ts /Users/apple/Desktop/codex/trip/test/app/passport-visa/page.tsx /Users/apple/Desktop/codex/trip/test/lib/passportVisaLegendFilters.test.mjs
git commit -m "refactor: load passport visa test data from json"
```

## Task 5: Add Admin API For Countries

**Files:**
- Create: `test/app/api/passport-visa-admin/countries/route.ts`
- Create: `test/app/api/passport-visa-admin/countries/[code]/route.ts`
- Modify: `test/lib/passportVisaAdminRepository.ts`
- Modify: `test/lib/passportVisaAdminValidation.ts`

- [ ] **Step 1: Write the failing API route test plan note**

Because this workspace uses no HTTP integration test harness yet, create minimal unit-level coverage first by validating repository and validator behavior before wiring handlers. The route handlers should be implemented as thin wrappers over those tested components.

- [ ] **Step 2: Implement collection GET/POST route**

Create `test/app/api/passport-visa-admin/countries/route.ts` with:

```ts
import { NextResponse } from 'next/server';

import { createPassportVisaAdminFileRepository } from '../../../../lib/passportVisaAdminRepository';
import { validatePassportVisaCountryRecord } from '../../../../lib/passportVisaAdminValidation';

const repository = createPassportVisaAdminFileRepository();

export async function GET() {
  return NextResponse.json(await repository.listCountries());
}

export async function POST(request: Request) {
  const record = await request.json();
  validatePassportVisaCountryRecord(record);
  const countries = await repository.listCountries();
  if (countries.some((country) => country.mapCountryCode === record.mapCountryCode)) {
    return NextResponse.json({ error: 'mapCountryCode already exists' }, { status: 400 });
  }
  const nextCountries = [...countries, record];
  await repository.saveCountries(nextCountries);
  return NextResponse.json(record, { status: 201 });
}
```

- [ ] **Step 3: Implement single-country PATCH/DELETE route**

Create `test/app/api/passport-visa-admin/countries/[code]/route.ts` with PATCH and DELETE handlers that:

- locate the country by `params.code`
- validate on PATCH
- reject DELETE when scenario data still references the country code

- [ ] **Step 4: Run build to verify route types**

Run:

```bash
npm run build
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/apple/Desktop/codex/trip/test/app/api/passport-visa-admin/countries /Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminRepository.ts /Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminValidation.ts
git commit -m "feat: add passport visa admin country api"
```

## Task 6: Add Admin API For Scenarios And Theme

**Files:**
- Create: `test/app/api/passport-visa-admin/scenarios/route.ts`
- Create: `test/app/api/passport-visa-admin/scenarios/[id]/route.ts`
- Create: `test/app/api/passport-visa-admin/theme/route.ts`

- [ ] **Step 1: Implement scenario collection routes**

Create collection GET/POST routes with duplicate `id` protection and validation.

- [ ] **Step 2: Implement single-scenario PATCH/DELETE routes**

Create per-scenario routes that:

- update label/id/countryCodes
- delete the scenario by id

- [ ] **Step 3: Implement theme GET/PATCH route**

Create `test/app/api/passport-visa-admin/theme/route.ts` with:

- GET returns current theme
- PATCH validates and saves full theme record

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/apple/Desktop/codex/trip/test/app/api/passport-visa-admin/scenarios /Users/apple/Desktop/codex/trip/test/app/api/passport-visa-admin/theme
git commit -m "feat: add passport visa admin scenario and theme api"
```

## Task 7: Build Admin UI Skeleton

**Files:**
- Create: `test/app/passport-visa-admin/page.tsx`
- Create: `test/app/passport-visa-admin/page.module.css`

- [ ] **Step 1: Write the minimal page scaffold**

Create a page with three sections:

- `Countries`
- `Scenarios`
- `Theme`

Use server-side fetches or client fetches against the new admin API.

- [ ] **Step 2: Build Countries list and edit form**

Include:

- search input
- country list
- selected country editor form
- save button

- [ ] **Step 3: Build Scenarios list and country multi-select**

Include:

- scenario list
- selected scenario editor
- searchable country checklist

- [ ] **Step 4: Build Theme editor**

Include:

- text inputs for color hex values
- simple preview swatches

- [ ] **Step 5: Run build**

Run:

```bash
npm run build
```

Expected:

- PASS

- [ ] **Step 6: Commit**

```bash
git add /Users/apple/Desktop/codex/trip/test/app/passport-visa-admin/page.tsx /Users/apple/Desktop/codex/trip/test/app/passport-visa-admin/page.module.css
git commit -m "feat: add passport visa admin ui skeleton"
```

## Task 8: Wire Immediate Save Feedback And Final Documentation

**Files:**
- Modify: `test/app/passport-visa-admin/page.tsx`
- Modify: `docs/guides/passport-visa-map-maintenance.md`

- [ ] **Step 1: Add save feedback states**

Add UI states for:

- saving
- save success
- save failure

Do this independently for countries, scenarios, and theme forms.

- [ ] **Step 2: Update maintenance guide**

Add a new section covering:

- admin page entry path
- JSON data source paths
- immediate-save behavior
- future database migration note

- [ ] **Step 3: Run final verification**

Run:

```bash
node --test /Users/apple/Desktop/codex/trip/test/lib/passportVisaScenarios.test.mjs /Users/apple/Desktop/codex/trip/test/lib/passportVisaLegendFilters.test.mjs /Users/apple/Desktop/codex/trip/test/lib/passportVisaMapColoring.test.mjs /Users/apple/Desktop/codex/trip/test/lib/passportVisaFlag.test.mjs /Users/apple/Desktop/codex/trip/test/lib/passportVisaViewport.test.mjs /Users/apple/Desktop/codex/trip/test/lib/passportVisaSvgStroke.test.mjs /Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminValidation.test.mjs /Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminRepository.test.mjs
npm run build
```

Expected:

- All tests PASS
- Build PASS

- [ ] **Step 4: Commit**

```bash
git add /Users/apple/Desktop/codex/trip/test/app/passport-visa-admin/page.tsx /Users/apple/Desktop/codex/trip/docs/guides/passport-visa-map-maintenance.md
git commit -m "docs: finalize passport visa admin workflow"
```

## Self-Review

Spec coverage:

- Countries admin: covered by Tasks 1, 2, 3, 5, 7, 8
- Scenarios admin: covered by Tasks 1, 3, 4, 6, 7
- Theme admin: covered by Tasks 1, 4, 6, 7
- File storage now / DB later boundary: covered by Tasks 2, 3, 4, 5, 6
- Immediate-save behavior: covered by Tasks 5, 6, 7, 8

Placeholder scan:

- No `TODO`/`TBD`
- Commands and files are explicit
- Where full production code would be repetitive, route handler responsibilities are still concretely named and bounded

Type consistency:

- `PassportVisaCountryRecord`, `PassportVisaScenarioRecord`, and `PassportVisaThemeRecord` are introduced before repository and route tasks
- `PassportVisaScenarioId` remains a front-end derived type from scenario definitions
