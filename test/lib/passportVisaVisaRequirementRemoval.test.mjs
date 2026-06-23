import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('admin editor source no longer renders a visa requirement field', async () => {
  const source = await fs.readFile(
    new URL('../../src/modules/maps/packages/china-passport-visa-map/admin/ChinaPassportVisaMapAdminPage.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /<label className=\{styles\.label\}>签证要求<\/label>/);
  assert.doesNotMatch(source, /\bcountryDraft\.visaRequirement\b/);
});

test('admin and frontend country types no longer define visaRequirement', async () => {
  const adminTypes = await fs.readFile(
    new URL('./passportVisaAdminTypes.ts', import.meta.url),
    'utf8',
  );
  const frontendTypes = await fs.readFile(
    new URL('../../src/modules/maps/packages/china-passport-visa-map/data/passportVisaTypes.ts', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(adminTypes, /\bvisaRequirement\b/);
  assert.doesNotMatch(frontendTypes, /\bvisaRequirement\b/);
});
