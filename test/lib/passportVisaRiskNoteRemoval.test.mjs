import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('admin editor source no longer renders a risk note field', async () => {
  const source = await fs.readFile(
    new URL('../../src/modules/maps/packages/china-passport-visa-map/admin/ChinaPassportVisaMapAdminPage.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /风险备注/);
  assert.doesNotMatch(source, /riskNote/);
});

test('admin and frontend country types no longer define riskNote', async () => {
  const adminTypes = await fs.readFile(
    new URL('./passportVisaAdminTypes.ts', import.meta.url),
    'utf8',
  );
  const frontendTypes = await fs.readFile(
    new URL('../../src/modules/maps/packages/china-passport-visa-map/data/passportVisaTypes.ts', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(adminTypes, /\briskNote\b/);
  assert.doesNotMatch(frontendTypes, /\briskNote\b/);
});
