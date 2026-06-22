import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('admin editor source no longer renders a risk note field', async () => {
  const source = await fs.readFile(
    new URL('../app/passport-visa-admin/page.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /风险备注/);
  assert.doesNotMatch(source, /riskNote/);
});

test('local standalone types and repository no longer define risk note fields', async () => {
  const adminTypes = await fs.readFile(
    new URL('./passportVisaAdminTypes.ts', import.meta.url),
    'utf8',
  );
  const repository = await fs.readFile(
    new URL('./passportVisaAdminRepository.ts', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(adminTypes, /\briskNote\b/);
  assert.doesNotMatch(repository, /\briskNote\b/);
  assert.doesNotMatch(repository, /\bhighRiskNote\b/);
});
