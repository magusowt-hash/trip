import test from 'node:test';
import assert from 'node:assert/strict';

import { getPassportVisaFlagSrc } from './passportVisaFlag.ts';

test('builds a lowercase svg path for the selected country flag', () => {
  assert.equal(getPassportVisaFlagSrc('US'), '/svg/us.svg');
});

test('preserves multi-part country codes for svg lookups', () => {
  assert.equal(getPassportVisaFlagSrc('GB-ENG'), '/svg/gb-eng.svg');
});
