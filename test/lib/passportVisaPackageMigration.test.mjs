import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('formal passport visa frontend page no longer depends on test app page module', async () => {
  const source = await fs.readFile(
    new URL('../../src/modules/maps/packages/china-passport-visa-map/frontend/PassportVisaPage.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /test\/app\/passport-visa\/page/);
});

test('formal passport visa admin page no longer depends on test app admin page module', async () => {
  const source = await fs.readFile(
    new URL('../../src/modules/maps/packages/china-passport-visa-map/admin/ChinaPassportVisaMapAdminPage.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /test\/app\/passport-visa-admin\/page/);
});

test('formal passport visa package source tree does not import test modules', async () => {
  const packageRoot = new URL('../../src/modules/maps/packages/china-passport-visa-map/', import.meta.url);
  const pending = [packageRoot];
  const offending = [];

  while (pending.length > 0) {
    const current = pending.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const nextUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, current);
      if (entry.isDirectory()) {
        pending.push(nextUrl);
        continue;
      }

      if (!/\.(ts|tsx)$/.test(entry.name)) {
        continue;
      }

      const source = await fs.readFile(nextUrl, 'utf8');
      if (/test\//.test(source)) {
        offending.push(path.relative(process.cwd(), nextUrl.pathname));
      }
    }
  }

  assert.deepEqual(offending, []);
});

test('test passport visa frontend wrapper imports src implementation through alias path', async () => {
  const source = await fs.readFile(
    new URL('../../test/app/passport-visa/page.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /from ['"]@\/modules\/maps\/packages\/china-passport-visa-map\/shared\/PassportVisaClientPage['"]/,
  );
  assert.doesNotMatch(source, /\.\.\/\.\.\/\.\.\/src\/modules\/maps\/packages\/china-passport-visa-map\/shared\/PassportVisaClientPage/);
});

test('test passport visa admin wrapper imports src implementation through alias path', async () => {
  const source = await fs.readFile(
    new URL('../../test/app/passport-visa-admin/page.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /from ['"]@\/modules\/maps\/packages\/china-passport-visa-map\/shared\/PassportVisaAdminClientPage['"]/,
  );
  assert.doesNotMatch(source, /\.\.\/\.\.\/\.\.\/src\/modules\/maps\/packages\/china-passport-visa-map\/shared\/PassportVisaAdminClientPage/);
});

test('src passport visa frontend route imports shared implementation through alias path', async () => {
  const source = await fs.readFile(
    new URL('../../src/app/passport-visa/page.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /from ['"]@\/modules\/maps\/packages\/china-passport-visa-map\/shared\/PassportVisaClientPage['"]/,
  );
});

test('src passport visa admin route imports shared implementation through alias path', async () => {
  const source = await fs.readFile(
    new URL('../../src/app/passport-visa-admin/page.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /from ['"]@\/modules\/maps\/packages\/china-passport-visa-map\/shared\/PassportVisaAdminClientPage['"]/,
  );
});
