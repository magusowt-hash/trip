# Passport Visa Admin Country Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three MFA country-section text fields to the test-stage passport-visa admin country editor, bulk backfill them from the scraped dataset, and keep missing values empty.

**Architecture:** Extend the existing `PassportVisaCountryRecord` model with three plain-text fields, keep `countries.json` as the single editable source of truth, and use a one-time sync script to map `data/mfa-country-info.json` into that file by Chinese country name. The existing admin API and bootstrap flow remain in place; only the shared type, validation, seed data, and country editor UI are extended.

**Tech Stack:** Next.js route handlers, TypeScript types, JSON file repository, Node.js test runner, plain Node ESM scripts

---

### Task 1: Add failing validation and sync tests

**Files:**
- Modify: `test/lib/passportVisaAdminValidation.test.mjs`
- Create: `scripts/syncMfaCountrySections.test.mjs`
- Reference: `test/lib/passportVisaAdminValidation.ts`

- [ ] **Step 1: Add a failing validation test for empty country section strings**

Append this test to `test/lib/passportVisaAdminValidation.test.mjs`:

```js
test('accepts empty MFA country section fields', () => {
  assert.doesNotThrow(() => validatePassportVisaCountryRecord({
    mapCountryCode: 'MX',
    englishName: 'Mexico',
    chineseName: '墨西哥',
    displayGroup: 'visa-free',
    rawLabel: '免签',
    visaFee: '0',
    visaRequirement: '',
    stayDuration: '180天',
    officialVisaUrl: 'https://example.com/visa',
    embassyUrl: 'https://example.com/embassy',
    riskLevel: '低风险',
    riskNote: '',
    entryResidence: '',
    travelRiskSafety: '',
    safetyPrecautions: '',
  }));
});
```

- [ ] **Step 2: Create a failing sync script test**

Create `scripts/syncMfaCountrySections.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { applyMfaCountrySections } from './syncMfaCountrySections.mjs';

test('applyMfaCountrySections fills matching countries and leaves unmatched countries blank', () => {
  const countries = [
    {
      mapCountryCode: 'JP',
      englishName: 'Japan',
      chineseName: '日本',
      displayGroup: 'visa-required',
      rawLabel: '需签证',
      visaFee: '',
      visaRequirement: '',
      stayDuration: '',
      officialVisaUrl: 'https://example.com/jp',
      embassyUrl: 'https://example.com/jp-embassy',
      riskLevel: '中风险',
      riskNote: '',
    },
    {
      mapCountryCode: 'AQ',
      englishName: 'Antarctica',
      chineseName: '南极洲',
      displayGroup: 'region-neutral',
      rawLabel: '',
      visaFee: '',
      visaRequirement: '',
      stayDuration: '',
      officialVisaUrl: 'https://example.com/aq',
      embassyUrl: 'https://example.com/aq-embassy',
      riskLevel: '低风险',
      riskNote: '',
    },
  ];

  const scraped = {
    countries: [
      {
        countryName: '日本',
        entryResidence: { text: '日本入境居留' },
        travelRiskSafety: { text: '日本旅行风险提醒' },
        safetyPrecautions: { text: '日本安全防范' },
      },
    ],
  };

  const result = applyMfaCountrySections(countries, scraped);

  assert.equal(result.records[0].entryResidence, '日本入境居留');
  assert.equal(result.records[0].travelRiskSafety, '日本旅行风险提醒');
  assert.equal(result.records[0].safetyPrecautions, '日本安全防范');
  assert.equal(result.records[1].entryResidence, '');
  assert.equal(result.records[1].travelRiskSafety, '');
  assert.equal(result.records[1].safetyPrecautions, '');
  assert.deepEqual(result.unmatchedCountryNames, ['南极洲']);
  assert.equal(result.matchedCount, 1);
});
```

- [ ] **Step 3: Run the validation and sync tests to verify failure**

Run:

```bash
node --test /Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminValidation.test.mjs /Users/apple/Desktop/codex/trip/scripts/syncMfaCountrySections.test.mjs
```

Expected:

- `passportVisaAdminValidation.test.mjs` fails because `PassportVisaCountryRecord` does not yet contain the three new fields in all test fixtures
- `syncMfaCountrySections.test.mjs` fails because `scripts/syncMfaCountrySections.mjs` does not exist yet

- [ ] **Step 4: Commit the failing tests checkpoint**

```bash
git add /Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminValidation.test.mjs /Users/apple/Desktop/codex/trip/scripts/syncMfaCountrySections.test.mjs
git commit -m "test: add MFA country section coverage"
```

### Task 2: Extend the shared country model and validation

**Files:**
- Modify: `test/lib/passportVisaAdminTypes.ts`
- Modify: `test/lib/passportVisaAdminValidation.ts`
- Modify: `test/lib/passportVisaAdminValidation.test.mjs`

- [ ] **Step 1: Add the three new string fields to the shared country type**

Update `PassportVisaCountryRecord` in `test/lib/passportVisaAdminTypes.ts` to include:

```ts
  entryResidence: string;
  travelRiskSafety: string;
  safetyPrecautions: string;
```

Insert them after `riskNote?: string;` only if you also make `riskNote` required everywhere; otherwise place them before `riskLevel` and keep `riskNote?: string` as-is:

```ts
  officialVisaUrl: string;
  embassyUrl: string;
  entryResidence: string;
  travelRiskSafety: string;
  safetyPrecautions: string;
  riskLevel: PassportVisaRiskLevel;
  riskNote?: string;
```

- [ ] **Step 2: Enforce string-only validation for the new fields**

In `test/lib/passportVisaAdminValidation.ts`, add a helper:

```ts
function assertString(value: unknown, fieldName: string): asserts value is string {
  assert(typeof value === 'string', `${fieldName} must be a string`);
}
```

Then add to `validatePassportVisaCountryRecord` before URL validation:

```ts
  assertString(record.entryResidence, 'entryResidence');
  assertString(record.travelRiskSafety, 'travelRiskSafety');
  assertString(record.safetyPrecautions, 'safetyPrecautions');
```

- [ ] **Step 3: Update existing validation test fixtures to include the new fields**

In `test/lib/passportVisaAdminValidation.test.mjs`, add these properties to every `validatePassportVisaCountryRecord(...)` fixture:

```js
entryResidence: '',
travelRiskSafety: '',
safetyPrecautions: '',
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
node --test /Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminValidation.test.mjs
```

Expected:

- all validation tests pass

- [ ] **Step 5: Commit the shared model update**

```bash
git add /Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminTypes.ts /Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminValidation.ts /Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminValidation.test.mjs
git commit -m "feat: extend passport visa country model with MFA sections"
```

### Task 3: Implement the one-time MFA section sync script

**Files:**
- Create: `scripts/syncMfaCountrySections.mjs`
- Test: `scripts/syncMfaCountrySections.test.mjs`
- Modify: `test/data/passport-visa/countries.json`

- [ ] **Step 1: Implement the pure mapping helper and CLI script**

Create `scripts/syncMfaCountrySections.mjs` with:

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const countriesPath = path.resolve(scriptDir, '../test/data/passport-visa/countries.json');
const scrapedPath = path.resolve(scriptDir, '../data/mfa-country-info.json');

export function applyMfaCountrySections(countries, scrapedData) {
  const scrapedMap = new Map(
    (scrapedData.countries ?? []).map((country) => [country.countryName, country]),
  );

  let matchedCount = 0;
  const unmatchedCountryNames = [];

  const records = countries.map((country) => {
    const scraped = scrapedMap.get(country.chineseName);
    if (!scraped) {
      unmatchedCountryNames.push(country.chineseName);
      return {
        ...country,
        entryResidence: '',
        travelRiskSafety: '',
        safetyPrecautions: '',
      };
    }

    matchedCount += 1;
    return {
      ...country,
      entryResidence: scraped.entryResidence?.text || '',
      travelRiskSafety: scraped.travelRiskSafety?.text || '',
      safetyPrecautions: scraped.safetyPrecautions?.text || '',
    };
  });

  return { records, matchedCount, unmatchedCountryNames };
}

async function main() {
  const countries = JSON.parse(await fs.readFile(countriesPath, 'utf8'));
  const scrapedData = JSON.parse(await fs.readFile(scrapedPath, 'utf8'));
  const result = applyMfaCountrySections(countries, scrapedData);
  await fs.writeFile(countriesPath, `${JSON.stringify(result.records, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    matchedCount: result.matchedCount,
    totalCountries: result.records.length,
    unmatchedCountryNames: result.unmatchedCountryNames,
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 2: Run the sync script test to verify it passes**

Run:

```bash
node --test /Users/apple/Desktop/codex/trip/scripts/syncMfaCountrySections.test.mjs
```

Expected:

- sync test passes

- [ ] **Step 3: Run the sync script against the real dataset**

Run:

```bash
node /Users/apple/Desktop/codex/trip/scripts/syncMfaCountrySections.mjs
```

Expected:

- JSON summary printed with `matchedCount`
- `test/data/passport-visa/countries.json` rewritten with `entryResidence`, `travelRiskSafety`, and `safetyPrecautions` on every record

- [ ] **Step 4: Verify the rewritten country data shape**

Run:

```bash
node --input-type=module -e "import fs from 'node:fs'; const countries=JSON.parse(fs.readFileSync('test/data/passport-visa/countries.json','utf8')); console.log(JSON.stringify({count:countries.length, sample:countries.filter((c)=>['日本','美国','南极洲'].includes(c.chineseName)).map((c)=>({name:c.chineseName, entry:typeof c.entryResidence==='string'?c.entryResidence.slice(0,40):null, risk:typeof c.travelRiskSafety==='string'?c.travelRiskSafety.slice(0,40):null, safety:typeof c.safetyPrecautions==='string'?c.safetyPrecautions.slice(0,40):null}))}, null, 2));"
```

Expected:

- `日本` and `美国` show non-empty section text
- unmatched sample, if present, remains empty strings

- [ ] **Step 5: Commit the synced country data**

```bash
git add /Users/apple/Desktop/codex/trip/scripts/syncMfaCountrySections.mjs /Users/apple/Desktop/codex/trip/scripts/syncMfaCountrySections.test.mjs /Users/apple/Desktop/codex/trip/test/data/passport-visa/countries.json
git commit -m "feat: backfill passport visa country MFA sections"
```

### Task 4: Add the new fields to the admin country editor

**Files:**
- Modify: `test/app/passport-visa-admin/page.tsx`
- Modify: `test/app/passport-visa-admin/page.module.css`

- [ ] **Step 1: Extend the empty country draft defaults**

In `test/app/passport-visa-admin/page.tsx`, update `emptyCountry`:

```ts
const emptyCountry: PassportVisaCountryRecord = {
  mapCountryCode: '',
  englishName: '',
  chineseName: '',
  displayGroup: 'visa-required',
  rawLabel: '',
  visaFee: '',
  visaRequirement: '',
  stayDuration: '',
  officialVisaUrl: '',
  embassyUrl: '',
  entryResidence: '',
  travelRiskSafety: '',
  safetyPrecautions: '',
  riskLevel: '低风险',
  riskNote: '',
};
```

- [ ] **Step 2: Add three textarea fields to the country editor form**

In the country edit form of `test/app/passport-visa-admin/page.tsx`, add three `fieldRow` blocks after the existing `签证要求` field and before the URL fields:

```tsx
<div className={styles.fieldRow}>
  <label className={styles.label}>入境居留</label>
  <textarea
    className={`${styles.textarea} ${styles.longTextarea}`}
    value={countryDraft.entryResidence}
    onChange={(event) => setCountryDraft((current) => ({ ...current, entryResidence: event.target.value }))}
  />
</div>
<div className={styles.fieldRow}>
  <label className={styles.label}>旅行风险等级和安全提醒</label>
  <textarea
    className={`${styles.textarea} ${styles.longTextarea}`}
    value={countryDraft.travelRiskSafety}
    onChange={(event) => setCountryDraft((current) => ({ ...current, travelRiskSafety: event.target.value }))}
  />
</div>
<div className={styles.fieldRow}>
  <label className={styles.label}>安全防范</label>
  <textarea
    className={`${styles.textarea} ${styles.longTextarea}`}
    value={countryDraft.safetyPrecautions}
    onChange={(event) => setCountryDraft((current) => ({ ...current, safetyPrecautions: event.target.value }))}
  />
</div>
```

- [ ] **Step 3: Add a taller textarea helper style**

In `test/app/passport-visa-admin/page.module.css`, add:

```css
.longTextarea {
  min-height: 220px;
}
```

Place it near the existing `.textarea` rule.

- [ ] **Step 4: Run a targeted type/build sanity check**

Run:

```bash
npx tsc --noEmit
```

Expected:

- TypeScript completes without errors caused by the new country fields

- [ ] **Step 5: Commit the admin editor changes**

```bash
git add /Users/apple/Desktop/codex/trip/test/app/passport-visa-admin/page.tsx /Users/apple/Desktop/codex/trip/test/app/passport-visa-admin/page.module.css
git commit -m "feat: add MFA country section fields to admin editor"
```

### Task 5: Final verification and documentation touch-up

**Files:**
- Modify: `docs/guides/passport-visa-map-maintenance.md`
- Verify: `test/lib/passportVisaAdminValidation.test.mjs`
- Verify: `scripts/syncMfaCountrySections.test.mjs`

- [ ] **Step 1: Document the new country fields in maintenance docs**

In `docs/guides/passport-visa-map-maintenance.md`, update the `countries.json` section to mention:

```md
- 领事补充字段当前还包括：
  - `entryResidence`
  - `travelRiskSafety`
  - `safetyPrecautions`
```

And note that these are editable from `/passport-visa-admin`.

- [ ] **Step 2: Run the focused test suite**

Run:

```bash
node --test /Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminValidation.test.mjs /Users/apple/Desktop/codex/trip/scripts/syncMfaCountrySections.test.mjs
```

Expected:

- all tests pass

- [ ] **Step 3: Re-run the data shape verification**

Run:

```bash
node --input-type=module -e "import fs from 'node:fs'; const countries=JSON.parse(fs.readFileSync('test/data/passport-visa/countries.json','utf8')); const missing=countries.filter((c)=>typeof c.entryResidence!=='string'||typeof c.travelRiskSafety!=='string'||typeof c.safetyPrecautions!=='string'); console.log(JSON.stringify({count:countries.length, missingCount:missing.length}, null, 2));"
```

Expected:

- `missingCount` is `0`

- [ ] **Step 4: Commit docs and verification-ready state**

```bash
git add /Users/apple/Desktop/codex/trip/docs/guides/passport-visa-map-maintenance.md
git commit -m "docs: document MFA country section fields"
```
