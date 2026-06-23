import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('admin page defines dedicated fixed-panel row templates for list and editor layouts', async () => {
  const css = await fs.readFile(
    new URL('../../src/modules/maps/packages/china-passport-visa-map/admin/ChinaPassportVisaMapAdminPage.module.css', import.meta.url),
    'utf8',
  );

  assert.match(css, /\.fixedPanel\s*\{[\s\S]*height:\s*calc\(100vh - 96px\);/);
  assert.doesNotMatch(css, /\.fixedPanel\s*\{[\s\S]*height:\s*1180px;/);
  assert.match(css, /\.listPanel\s*\{[\s\S]*grid-template-rows:\s*auto auto minmax\(0,\s*1fr\);/);
  assert.match(css, /\.editorPanel\s*\{[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\);/);
});

test('admin page applies dedicated list and editor panel classes', async () => {
  const source = await fs.readFile(
    new URL('../../src/modules/maps/packages/china-passport-visa-map/admin/ChinaPassportVisaMapAdminPage.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /styles\.listPanel/);
  assert.match(source, /styles\.editorPanel/);
});
