# Passport Visa Risk Mark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an SVG risk mark to the right side of the country name block in the passport-visa detail drawer header.

**Architecture:** Introduce a tiny shared risk-mark helper that maps `riskLevel` to SVG metadata and a React component, then render it inside the existing `drawerTitleRow` with a fixed-width wrapper so the title layout stays stable. Keep the existing lower badge row unchanged.

**Tech Stack:** Next.js test workspace, React, CSS modules, Node.js test runner

---

### Task 1: Add failing tests for risk mark mapping

**Files:**
- Create: `test/lib/passportVisaRiskMark.test.mjs`
- Create: `test/lib/passportVisaRiskMark.tsx`

- [ ] **Step 1: Write the failing mapping tests**

Create `test/lib/passportVisaRiskMark.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { getPassportVisaRiskMarkSpec } from './passportVisaRiskMark.tsx';

test('maps low risk to shield-check mark', () => {
  assert.deepEqual(getPassportVisaRiskMarkSpec('低风险'), {
    kind: 'shield-check',
    color: '#1F9D55',
    title: '低风险',
  });
});

test('maps medium and high risk to warning marks with different colors', () => {
  assert.deepEqual(getPassportVisaRiskMarkSpec('中风险'), {
    kind: 'warning',
    color: '#D4A52A',
    title: '中风险',
  });
  assert.deepEqual(getPassportVisaRiskMarkSpec('高风险'), {
    kind: 'warning',
    color: '#D66A1F',
    title: '高风险',
  });
});

test('maps do-not-travel to prohibited mark', () => {
  assert.deepEqual(getPassportVisaRiskMarkSpec('请勿前往'), {
    kind: 'prohibited',
    color: '#C53E3E',
    title: '请勿前往',
  });
});
```

- [ ] **Step 2: Run the risk mark test to verify failure**

Run:

```bash
node --test /Users/apple/Desktop/codex/trip/test/lib/passportVisaRiskMark.test.mjs
```

Expected:

- failure because `test/lib/passportVisaRiskMark.tsx` does not exist yet

### Task 2: Implement the shared risk mark helper and component

**Files:**
- Create: `test/lib/passportVisaRiskMark.tsx`
- Test: `test/lib/passportVisaRiskMark.test.mjs`

- [ ] **Step 1: Implement the risk mark spec helper and component**

Create `test/lib/passportVisaRiskMark.tsx` with:

```tsx
import type { SVGProps } from 'react';

import type { PassportVisaRiskLevel } from './passportVisaAdminTypes';

export type PassportVisaRiskMarkSpec = {
  kind: 'shield-check' | 'warning' | 'prohibited';
  color: string;
  title: PassportVisaRiskLevel;
};

export function getPassportVisaRiskMarkSpec(riskLevel: PassportVisaRiskLevel): PassportVisaRiskMarkSpec {
  if (riskLevel === '低风险') {
    return { kind: 'shield-check', color: '#1F9D55', title: '低风险' };
  }
  if (riskLevel === '中风险') {
    return { kind: 'warning', color: '#D4A52A', title: '中风险' };
  }
  if (riskLevel === '高风险') {
    return { kind: 'warning', color: '#D66A1F', title: '高风险' };
  }
  return { kind: 'prohibited', color: '#C53E3E', title: '请勿前往' };
}

type PassportVisaRiskMarkProps = SVGProps<SVGSVGElement> & {
  riskLevel: PassportVisaRiskLevel;
};

export function PassportVisaRiskMark({ riskLevel, ...props }: PassportVisaRiskMarkProps) {
  const spec = getPassportVisaRiskMarkSpec(riskLevel);

  if (spec.kind === 'shield-check') {
    return (
      <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
        <path d="M24 4L38 9V21C38 31.5 31.3 40.4 24 44C16.7 40.4 10 31.5 10 21V9L24 4Z" fill={spec.color} />
        <path d="M17.5 24.5L22 29L31 19.5" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (spec.kind === 'warning') {
    return (
      <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
        <path d="M24 7L42 39H6L24 7Z" fill={spec.color} />
        <path d="M24 18V27" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
        <circle cx="24" cy="33" r="2.5" fill="#FFFFFF" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <circle cx="24" cy="24" r="17" stroke={spec.color} strokeWidth="6" />
      <path d="M14 34L34 14" stroke={spec.color} strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}
```

- [ ] **Step 2: Run the risk mark tests to verify they pass**

Run:

```bash
node --test /Users/apple/Desktop/codex/trip/test/lib/passportVisaRiskMark.test.mjs
```

Expected:

- all risk mark tests pass

### Task 3: Wire the risk mark into the drawer header

**Files:**
- Modify: `test/app/passport-visa/page.tsx`
- Modify: `test/app/passport-visa/page.module.css`
- Import: `test/lib/passportVisaRiskMark.tsx`

- [ ] **Step 1: Render the risk mark in the title row**

In `test/app/passport-visa/page.tsx`, add:

```tsx
import { PassportVisaRiskMark } from '../../lib/passportVisaRiskMark';
```

Then inside `drawerTitleRow`, after `drawerTitleText`, add:

```tsx
<div className={styles.riskMarkWrap} aria-label={`风险等级：${selectedCountry.riskLevel}`}>
  <PassportVisaRiskMark
    riskLevel={selectedCountry.riskLevel}
    className={styles.riskMark}
  />
</div>
```

- [ ] **Step 2: Add stable layout styles**

In `test/app/passport-visa/page.module.css`, add:

```css
.riskMarkWrap {
  flex: 0 0 52px;
  width: 52px;
  min-width: 52px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.riskMark {
  width: 44px;
  height: 44px;
  display: block;
}
```

Keep `drawerTitleText` flexible so the icon occupies the right-side blank space.

### Task 4: Verify

**Files:**
- Verify: `test/lib/passportVisaRiskMark.test.mjs`
- Verify: `test/package.json`

- [ ] **Step 1: Re-run the risk mark tests**

Run:

```bash
node --test /Users/apple/Desktop/codex/trip/test/lib/passportVisaRiskMark.test.mjs
```

Expected:

- all tests pass

- [ ] **Step 2: Run the test workspace typecheck**

Run:

```bash
cd /Users/apple/Desktop/codex/trip/test && npx tsc --noEmit
```

Expected:

- test workspace typecheck passes
