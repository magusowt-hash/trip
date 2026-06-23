import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validatePassportVisaCountryRecord,
  validatePassportVisaScenarioRecord,
  validatePassportVisaThemeSchemeRecord,
  validatePassportVisaThemeRecord,
} from './passportVisaAdminValidation.ts';

test('rejects duplicate scenario country codes', () => {
  assert.throws(
    () => validatePassportVisaScenarioRecord({
      id: 'demo',
      label: '演示',
      countryCodes: ['MX', 'MX'],
    }),
    /duplicate/i,
  );
});

test('rejects invalid theme color values', () => {
  assert.throws(
    () => validatePassportVisaThemeRecord({
      label: 'bad',
      visaFree: 'gold',
      arrivalOrEVisa: '#ffffff',
      visaRequired: '#000000',
      noData: '#eeeeee',
      stroke: '#ffffff',
      accentStrong: '#123456',
    }),
    /hex/i,
  );
});

test('rejects invalid country urls', () => {
  assert.throws(
    () => validatePassportVisaCountryRecord({
      mapCountryCode: 'MX',
      englishName: 'Mexico',
      chineseName: '墨西哥',
      displayGroup: 'visa-free',
      rawLabel: '免签',
      visaFee: '0',
      stayDuration: '180天',
      officialVisaUrl: 'not-a-url',
      embassyUrl: 'https://example.com',
      entryResidence: '',
      travelRiskSafety: '',
      safetyPrecautions: '',
      religiousLawRestrictions: '',
      riskLevel: '低风险',
    }),
    /officialVisaUrl/i,
  );
});

test('rejects invalid risk level values', () => {
  assert.throws(
    () => validatePassportVisaCountryRecord({
      mapCountryCode: 'MX',
      englishName: 'Mexico',
      chineseName: '墨西哥',
      displayGroup: 'visa-free',
      rawLabel: '免签',
      visaFee: '0',
      stayDuration: '180天',
      officialVisaUrl: 'https://example.com/visa',
      embassyUrl: 'https://example.com/embassy',
      entryResidence: '',
      travelRiskSafety: '',
      safetyPrecautions: '',
      religiousLawRestrictions: '',
      riskLevel: '极高风险',
    }),
    /riskLevel/i,
  );
});

test('rejects theme scheme without matching active theme', () => {
  assert.throws(
    () => validatePassportVisaThemeSchemeRecord({
      activeThemeId: 'missing',
      themes: [
        {
          id: 'default',
          label: '沙棕',
          visaFree: '#D4A52A',
          arrivalOrEVisa: '#F0DEBF',
          visaRequired: '#8B5E3C',
          noData: '#F4F3F0',
          stroke: '#FFFDF9',
          accentStrong: '#6F4B2F',
        },
      ],
    }),
    /activeThemeId/i,
  );
});

test('accepts empty MFA country section fields', () => {
  assert.doesNotThrow(() => validatePassportVisaCountryRecord({
    mapCountryCode: 'MX',
    englishName: 'Mexico',
    chineseName: '墨西哥',
    displayGroup: 'visa-free',
    rawLabel: '免签',
    visaFee: '0',
    stayDuration: '180天',
    officialVisaUrl: 'https://example.com/visa',
    embassyUrl: 'https://example.com/embassy',
    entryResidence: '',
    travelRiskSafety: '',
    safetyPrecautions: '',
    religiousLawRestrictions: '',
    riskLevel: '低风险',
  }));
});

test('accepts empty country urls for existing records', () => {
  assert.doesNotThrow(() => validatePassportVisaCountryRecord({
    mapCountryCode: 'CN',
    englishName: 'China',
    chineseName: '中国内地',
    displayGroup: 'region-neutral',
    rawLabel: '/',
    visaFee: '',
    stayDuration: '',
    officialVisaUrl: '',
    embassyUrl: '',
    entryResidence: '',
    travelRiskSafety: '',
    safetyPrecautions: '',
    religiousLawRestrictions: '',
    riskLevel: '低风险',
  }));
});

test('rejects non-string religious law restriction field', () => {
  assert.throws(
    () => validatePassportVisaCountryRecord({
      mapCountryCode: 'MX',
      englishName: 'Mexico',
      chineseName: '墨西哥',
      displayGroup: 'visa-free',
      rawLabel: '免签',
      visaFee: '0',
      stayDuration: '180天',
      officialVisaUrl: 'https://example.com/visa',
      embassyUrl: 'https://example.com/embassy',
      entryResidence: '',
      travelRiskSafety: '',
      safetyPrecautions: '',
      religiousLawRestrictions: null,
      riskLevel: '低风险',
    }),
    /religiousLawRestrictions/i,
  );
});
