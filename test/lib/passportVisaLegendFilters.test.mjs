import test from 'node:test';
import assert from 'node:assert/strict';

import { passportVisaSeed } from './passportVisaSeed.ts';
import { buildPassportVisaLegendFilterItems } from './passportVisaLegendFilters.ts';

test('builds legend filter items for the three visa status groups only', () => {
  const items = buildPassportVisaLegendFilterItems(passportVisaSeed);

  assert.deepEqual(
    items.map((item) => item.key),
    ['visa-free', 'arrival-or-evisa', 'visa-required'],
  );
});

test('legend filter item counts sum to canonical countries', () => {
  const items = buildPassportVisaLegendFilterItems(passportVisaSeed);
  const [visaFreeItem, arrivalItem, requiredItem] = items;

  assert.equal(visaFreeItem.count + arrivalItem.count + requiredItem.count, 200);
});

test('country seed remains populated after moving to json source', async () => {
  const { passportVisaSeed: importedSeed } = await import('./passportVisaSeed.ts');
  assert.ok(importedSeed.length > 200);
});
