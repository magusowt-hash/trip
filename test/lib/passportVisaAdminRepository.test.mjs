import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  createPassportVisaAdminFileRepository,
} from './passportVisaAdminRepository.ts';

const sampleFrontendCountries = [
  {
    entrySlug: 'cy',
    mapCountryCode: 'CY',
    englishName: 'Cyprus',
    chineseName: '塞浦路斯',
    visaCategoryRaw: '需提前办理申根/本国签证',
    visaCategoryGroup: 'conditional-entry',
    visaFee: '€90',
    visaRequirement: '',
    stayDuration: '90天',
    officialVisaUrl: 'https://www.mfa.gov.cy/visas',
    riskLevel: '中风险',
    entryResidence: '旧入境信息',
    travelRiskSafety: '旧风险信息',
    safetyPrecautions: '旧安全防范',
    religiousLawRestrictions: '旧教法约束',
    embassyUrl: 'https://cy.china-embassy.gov.cn',
  },
];

const sampleAdminDetails = [
  {
    mapCountryCode: 'CY',
    englishName: 'Cyprus',
    chineseName: '塞浦路斯',
    displayGroup: 'visa-required',
    rawLabel: '需提前办理申根/本国签证',
    visaFee: '€90',
    stayDuration: '90天',
    officialVisaUrl: 'https://www.mfa.gov.cy/visas',
    embassyUrl: 'https://cy.china-embassy.gov.cn',
    entryResidence: '旧入境信息',
    travelRiskSafety: '旧风险信息',
    safetyPrecautions: '旧安全防范',
    religiousLawRestrictions: '旧教法约束',
    riskLevel: '中风险',
  },
];

const realFrontendCountriesPath = new URL(
  '../data/passport-visa/countries.json',
  import.meta.url,
);

test('repository reads scenarios from the configured json file', async () => {
  const repository = createPassportVisaAdminFileRepository({
    countriesPath: realFrontendCountriesPath,
    scenariosPath: new URL('../data/passport-visa/scenarios.json', import.meta.url),
    themePath: new URL('../data/passport-visa/theme.json', import.meta.url),
  });

  const scenarios = await repository.listScenarios();
  assert.equal(Array.isArray(scenarios), true);
  assert.ok(scenarios.length > 0);
});

test('repository persists scenario updates to the configured file', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'passport-visa-repo-'));
  const countriesPath = path.join(tempDir, 'countries.json');
  const scenariosPath = path.join(tempDir, 'scenarios.json');
  const themePath = path.join(tempDir, 'theme.json');

  await fs.copyFile(
    realFrontendCountriesPath,
    countriesPath,
  );
  await fs.copyFile(
    new URL('../data/passport-visa/scenarios.json', import.meta.url),
    scenariosPath,
  );
  await fs.copyFile(
    new URL('../data/passport-visa/theme.json', import.meta.url),
    themePath,
  );

  const repository = createPassportVisaAdminFileRepository({
    countriesPath: new URL(`file://${countriesPath}`),
    scenariosPath: new URL(`file://${scenariosPath}`),
    themePath: new URL(`file://${themePath}`),
  });

  const scenarios = await repository.listScenarios();
  const nextScenarios = [...scenarios, { id: 'demo', label: '演示签', countryCodes: ['MX'] }];

  await repository.saveScenarios(nextScenarios);

  const savedScenarios = JSON.parse(await fs.readFile(scenariosPath, 'utf8'));
  assert.equal(savedScenarios.length, nextScenarios.length);
  assert.deepEqual(savedScenarios.at(-1), nextScenarios.at(-1));
});

test('repository reads active theme from theme scheme file', async () => {
  const repository = createPassportVisaAdminFileRepository({
    countriesPath: realFrontendCountriesPath,
    scenariosPath: new URL('../data/passport-visa/scenarios.json', import.meta.url),
    themePath: new URL('../data/passport-visa/theme.json', import.meta.url),
  });

  const theme = await repository.getTheme();
  const themeScheme = await repository.getThemeScheme();

  assert.equal(themeScheme.activeThemeId, 'default');
  assert.ok(Array.isArray(themeScheme.themes));
  assert.equal(themeScheme.themes.length > 0, true);
  assert.deepEqual(theme, themeScheme.themes.find((item) => item.id === themeScheme.activeThemeId));
});

test('repository persists theme scheme updates to the configured file', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'passport-visa-theme-repo-'));
  const countriesPath = path.join(tempDir, 'countries.json');
  const scenariosPath = path.join(tempDir, 'scenarios.json');
  const themePath = path.join(tempDir, 'theme.json');

  await fs.copyFile(
    realFrontendCountriesPath,
    countriesPath,
  );
  await fs.copyFile(
    new URL('../data/passport-visa/scenarios.json', import.meta.url),
    scenariosPath,
  );
  await fs.copyFile(
    new URL('../data/passport-visa/theme.json', import.meta.url),
    themePath,
  );

  const repository = createPassportVisaAdminFileRepository({
    countriesPath: new URL(`file://${countriesPath}`),
    scenariosPath: new URL(`file://${scenariosPath}`),
    themePath: new URL(`file://${themePath}`),
  });

  const themeScheme = await repository.getThemeScheme();
  const nextThemeScheme = {
    activeThemeId: 'ocean',
    themes: [
      ...themeScheme.themes,
      {
        id: 'ocean',
        label: '海蓝',
        visaFree: '#1E90FF',
        arrivalOrEVisa: '#9FD3FF',
        visaRequired: '#0D3B66',
        noData: '#EAF4FF',
        stroke: '#FFFFFF',
        accentStrong: '#0A2540',
      },
    ],
  };

  await repository.saveThemeScheme(nextThemeScheme);

  const savedThemeScheme = JSON.parse(await fs.readFile(themePath, 'utf8'));
  assert.equal(savedThemeScheme.activeThemeId, 'ocean');
  assert.deepEqual(savedThemeScheme.themes.at(-1), nextThemeScheme.themes.at(-1));
});

test('repository reads countries from the configured frontend data module', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'passport-visa-frontend-repo-'));
  const countriesPath = path.join(tempDir, 'countries.json');
  const scenariosPath = path.join(tempDir, 'scenarios.json');
  const themePath = path.join(tempDir, 'theme.json');

  await fs.writeFile(countriesPath, `${JSON.stringify(sampleFrontendCountries, null, 2)}\n`, 'utf8');
  await fs.copyFile(
    new URL('../data/passport-visa/scenarios.json', import.meta.url),
    scenariosPath,
  );
  await fs.copyFile(
    new URL('../data/passport-visa/theme.json', import.meta.url),
    themePath,
  );

  const repository = createPassportVisaAdminFileRepository({
    countriesPath: new URL(`file://${countriesPath}`),
    scenariosPath: new URL(`file://${scenariosPath}`),
    themePath: new URL(`file://${themePath}`),
  });

  const countries = await repository.listCountries();

  assert.equal(countries.length, 1);
  assert.deepEqual(countries[0], {
    ...sampleAdminDetails[0],
    displayGroup: 'arrival-or-evisa',
    visaRequirement: '',
    entryResidence: '旧入境信息',
    travelRiskSafety: '旧风险信息',
    safetyPrecautions: '旧安全防范',
    religiousLawRestrictions: '旧教法约束',
  });
});

test('repository persists country updates to the configured frontend data module', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'passport-visa-frontend-save-'));
  const countriesPath = path.join(tempDir, 'countries.json');
  const scenariosPath = path.join(tempDir, 'scenarios.json');
  const themePath = path.join(tempDir, 'theme.json');

  await fs.writeFile(countriesPath, `${JSON.stringify(sampleFrontendCountries, null, 2)}\n`, 'utf8');
  await fs.copyFile(
    new URL('../data/passport-visa/scenarios.json', import.meta.url),
    scenariosPath,
  );
  await fs.copyFile(
    new URL('../data/passport-visa/theme.json', import.meta.url),
    themePath,
  );

  const repository = createPassportVisaAdminFileRepository({
    countriesPath: new URL(`file://${countriesPath}`),
    scenariosPath: new URL(`file://${scenariosPath}`),
    themePath: new URL(`file://${themePath}`),
  });

  const nextCountries = [
    {
      ...sampleAdminDetails[0],
      displayGroup: 'arrival-or-evisa',
      rawLabel: '电子签',
      officialVisaUrl: 'https://updated.example.com',
      entryResidence: '新入境信息',
      travelRiskSafety: '新风险信息',
      safetyPrecautions: '新安全防范',
      religiousLawRestrictions: '新教法约束',
      riskLevel: '高风险',
    },
  ];

  await repository.saveCountries(nextCountries);

  const savedFrontendCountries = JSON.parse(await fs.readFile(countriesPath, 'utf8'));
  assert.equal(savedFrontendCountries.length, 1);
  assert.deepEqual(savedFrontendCountries[0], {
    entrySlug: 'cy',
    mapCountryCode: 'CY',
    englishName: 'Cyprus',
    chineseName: '塞浦路斯',
    visaCategoryRaw: '电子签',
    visaCategoryGroup: 'e-visa',
    visaFee: '€90',
    stayDuration: '90天',
    officialVisaUrl: 'https://updated.example.com',
    riskLevel: '高风险',
    entryResidence: '新入境信息',
    travelRiskSafety: '新风险信息',
    safetyPrecautions: '新安全防范',
    religiousLawRestrictions: '新教法约束',
    embassyUrl: 'https://cy.china-embassy.gov.cn',
  });
});
