import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('standalone frontend page no longer renders a visa requirement section', async () => {
  const source = await fs.readFile(
    new URL('../app/passport-visa/page.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /\bselectedCountry\.visaRequirement\b/);
  assert.doesNotMatch(source, /签证要求/);
});

test('standalone admin flow still keeps visa requirement editing support', async () => {
  const adminPage = await fs.readFile(
    new URL('../app/passport-visa-admin/page.tsx', import.meta.url),
    'utf8',
  );
  const adminTypes = await fs.readFile(
    new URL('./passportVisaAdminTypes.ts', import.meta.url),
    'utf8',
  );
  const repository = await fs.readFile(
    new URL('./passportVisaAdminRepository.ts', import.meta.url),
    'utf8',
  );

  assert.match(adminPage, /签证要求/);
  assert.match(adminTypes, /\bvisaRequirement\b/);
  assert.match(repository, /\bvisaRequirement\b/);
});
