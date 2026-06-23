import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getPassportVisaAdminEditTargetCode,
  hasPassportVisaAdminCountryRedirect,
  sortPassportVisaAdminCountries,
} from './passportVisaAdminSelection.ts';

test('territory entries redirect admin editing to their sovereign country', () => {
  assert.equal(hasPassportVisaAdminCountryRedirect('AI'), true);
  assert.equal(getPassportVisaAdminEditTargetCode('AI'), 'GB');
});

test('canonical country entries keep editing on themselves', () => {
  assert.equal(hasPassportVisaAdminCountryRedirect('GB'), false);
  assert.equal(getPassportVisaAdminEditTargetCode('GB'), 'GB');
});

test('empty region codes do not redirect and resolve safely', () => {
  assert.equal(hasPassportVisaAdminCountryRedirect(''), false);
  assert.equal(getPassportVisaAdminEditTargetCode(''), null);
  assert.equal(getPassportVisaAdminEditTargetCode(null), null);
});

test('sorts redirected regions to the bottom while preserving relative order', () => {
  const sorted = sortPassportVisaAdminCountries([
    { mapCountryCode: 'JP' },
    { mapCountryCode: 'AI' },
    { mapCountryCode: 'US' },
    { mapCountryCode: 'VG' },
  ]);

  assert.deepEqual(
    sorted.map((country) => country.mapCountryCode),
    ['JP', 'US', 'AI', 'VG'],
  );
});
