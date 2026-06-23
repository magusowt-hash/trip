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
  assert.match(source, /path\.setAttribute\('data-country-code', resolvedCode \?\? ''\)/);
  assert.match(source, /\}, \[activeTheme\.stroke\]\);/);
  assert.match(source, /href=\{selectedCountry\.officialVisaUrl\}/);
  assert.match(source, /aria-label="打开官方签证网站"/);
  assert.match(source, /title="官方签证网站"/);
  assert.match(source, /styles\.utilityRow/);
  assert.match(source, /PassportVisaOfficialSiteMark/);
  assert.match(source, /officialVisaEntryIcon/);
  assert.match(source, /PassportVisaFeeMark/);
  assert.match(source, /parsePassportVisaFeeDisplay/);
  assert.match(source, /\[\s*activeTheme,\s*animatedOverlayCode,[\s\S]*mapMarkupVersion,[\s\S]*visibleCountryCodes,\s*\]/);
});
