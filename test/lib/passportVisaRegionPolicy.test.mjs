import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isPassportVisaCanonicalRegion,
  resolvePassportVisaCountryCode,
} from './passportVisaRegionPolicy.ts';

test('disabled china regions resolve to themselves', () => {
  assert.equal(resolvePassportVisaCountryCode('CN'), 'CN');
  assert.equal(resolvePassportVisaCountryCode('HK'), 'HK');
  assert.equal(resolvePassportVisaCountryCode('MO'), 'MO');
  assert.equal(resolvePassportVisaCountryCode('TW'), 'TW');
});

test('disabled china regions are treated as canonical regions', () => {
  assert.equal(isPassportVisaCanonicalRegion('CN'), true);
  assert.equal(isPassportVisaCanonicalRegion('HK'), true);
  assert.equal(isPassportVisaCanonicalRegion('MO'), true);
  assert.equal(isPassportVisaCanonicalRegion('TW'), true);
});

test('territories still resolve to sovereign countries', () => {
  assert.equal(resolvePassportVisaCountryCode('UM-WQ'), 'US');
  assert.equal(isPassportVisaCanonicalRegion('UM-WQ'), false);
});
