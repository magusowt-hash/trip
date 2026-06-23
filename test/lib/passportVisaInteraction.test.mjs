import test from 'node:test';
import assert from 'node:assert/strict';

import { isPassportVisaCountryInteractive } from './passportVisaInteraction.ts';

test('treats visa countries as interactive when they have data', () => {
  assert.equal(isPassportVisaCountryInteractive({
    mapCountryCode: 'US',
    displayGroup: 'visa-required',
  }), true);
});

test('treats no-data countries as non-interactive even when their region code is mappable', () => {
  assert.equal(isPassportVisaCountryInteractive({
    mapCountryCode: 'US',
    displayGroup: 'region-neutral',
  }), false);
});

test('treats disabled china regions as interactive when they have data', () => {
  assert.equal(isPassportVisaCountryInteractive({
    mapCountryCode: 'CN',
    displayGroup: 'visa-required',
  }), true);
});
