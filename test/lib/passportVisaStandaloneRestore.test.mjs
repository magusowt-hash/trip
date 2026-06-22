import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('passport visa page is restored to the standalone bootstrap-driven version', async () => {
  const source = await fs.readFile(
    new URL('../app/passport-visa/page.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /fetch\('\/api\/passport-visa\/bootstrap'\)/);
  assert.match(source, /buildPassportVisaScenarioOptions/);
  assert.match(source, /getPassportVisaDetailInfoSpec/);
  assert.match(source, /PassportVisaRiskMark/);
  assert.match(source, /getPassportVisaHoverCardPosition/);
  assert.doesNotMatch(source, /passportVisaSeed\.map/);
  assert.doesNotMatch(source, /applyPassportVisaScenario\(passportVisaSeed/);
});
