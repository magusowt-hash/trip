import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyMfaCountrySections,
  inferRiskLevelFromTravelRiskSafety,
} from './syncMfaCountrySections.mjs';

test('inferRiskLevelFromTravelRiskSafety maps extreme high risk to 请勿前往', () => {
  assert.equal(
    inferRiskLevelFromTravelRiskSafety('某国现有红色（极高风险）地区2个，其他地区为黄色（中风险）。'),
    '请勿前往',
  );
});

test('inferRiskLevelFromTravelRiskSafety prefers high over medium and low', () => {
  assert.equal(
    inferRiskLevelFromTravelRiskSafety('某国现有橙色（高风险）地区1个，其他地区为黄色（中风险）。'),
    '高风险',
  );
});

test('inferRiskLevelFromTravelRiskSafety maps yellow and blue levels', () => {
  assert.equal(
    inferRiskLevelFromTravelRiskSafety('某国风险等级为黄色（中风险）。'),
    '中风险',
  );
  assert.equal(
    inferRiskLevelFromTravelRiskSafety('某国风险等级为蓝色（低风险）。'),
    '低风险',
  );
});

test('applyMfaCountrySections fills matching countries and leaves unmatched countries blank', () => {
  const countries = [
    {
      mapCountryCode: 'JP',
      englishName: 'Japan',
      chineseName: '日本',
      displayGroup: 'visa-required',
      rawLabel: '需签证',
      visaFee: '',
      stayDuration: '',
      officialVisaUrl: 'https://example.com/jp',
      embassyUrl: 'https://example.com/jp-embassy',
      riskLevel: '低风险',
      riskNote: '',
    },
    {
      mapCountryCode: 'AQ',
      englishName: 'Antarctica',
      chineseName: '南极洲',
      displayGroup: 'region-neutral',
      rawLabel: '',
      visaFee: '',
      stayDuration: '',
      officialVisaUrl: 'https://example.com/aq',
      embassyUrl: 'https://example.com/aq-embassy',
      riskLevel: '低风险',
      riskNote: '',
    },
  ];

  const scraped = {
      countries: [
      {
        countryName: '日本',
        entryResidence: { text: '日本入境居留' },
        travelRiskSafety: { text: '日本风险等级为黄色（中风险）。' },
        safetyPrecautions: { text: '日本安全防范' },
      },
    ],
  };

  const result = applyMfaCountrySections(countries, scraped);

  assert.equal(result.records[0].entryResidence, '日本入境居留');
  assert.equal(result.records[0].travelRiskSafety, '日本风险等级为黄色（中风险）。');
  assert.equal(result.records[0].safetyPrecautions, '日本安全防范');
  assert.equal(result.records[0].riskLevel, '中风险');
  assert.equal(result.records[1].entryResidence, '');
  assert.equal(result.records[1].travelRiskSafety, '');
  assert.equal(result.records[1].safetyPrecautions, '');
  assert.deepEqual(result.unmatchedCountryNames, ['南极洲']);
  assert.equal(result.matchedCount, 1);
});

test('applyMfaCountrySections matches scraped ASCII parentheses to local full-width parentheses', () => {
  const countries = [
    {
      mapCountryCode: 'CD',
      englishName: 'Congo, The Democratic Republic of the',
      chineseName: '刚果（金）',
      displayGroup: 'visa-required',
      rawLabel: '需签证',
      visaFee: '',
      stayDuration: '',
      officialVisaUrl: 'https://example.com/cd',
      embassyUrl: 'https://example.com/cd-embassy',
      entryResidence: '',
      travelRiskSafety: '',
      safetyPrecautions: '',
      riskLevel: '低风险',
      riskNote: '',
    },
    {
      mapCountryCode: 'CG',
      englishName: 'Congo',
      chineseName: '刚果（布）',
      displayGroup: 'visa-required',
      rawLabel: '需签证',
      visaFee: '',
      stayDuration: '',
      officialVisaUrl: 'https://example.com/cg',
      embassyUrl: 'https://example.com/cg-embassy',
      entryResidence: '',
      travelRiskSafety: '',
      safetyPrecautions: '',
      riskLevel: '低风险',
      riskNote: '',
    },
  ];

  const scraped = {
    countries: [
      {
        countryName: '刚果(金)',
        entryResidence: { text: '刚果金入境居留' },
        travelRiskSafety: { text: '刚果（金）现有红色（极高风险）地区4个。' },
        safetyPrecautions: { text: '刚果金安全防范' },
      },
      {
        countryName: '刚果(布)',
        entryResidence: { text: '刚果布入境居留' },
        travelRiskSafety: { text: '刚果（布）风险等级为蓝色（低风险）' },
        safetyPrecautions: { text: '刚果布安全防范' },
      },
    ],
  };

  const result = applyMfaCountrySections(countries, scraped);

  assert.equal(result.records[0].entryResidence, '刚果金入境居留');
  assert.equal(result.records[0].riskLevel, '请勿前往');
  assert.equal(result.records[1].entryResidence, '刚果布入境居留');
  assert.equal(result.records[1].riskLevel, '低风险');
  assert.deepEqual(result.unmatchedCountryNames, []);
  assert.equal(result.matchedCount, 2);
});

test('applyMfaCountrySections matches known MFA aliases to local country names', () => {
  const countries = [
    {
      mapCountryCode: 'AE',
      englishName: 'United Arab Emirates',
      chineseName: '阿拉伯联合酋长国',
      displayGroup: 'visa-free',
      rawLabel: '免签',
      visaFee: '',
      stayDuration: '',
      officialVisaUrl: 'https://example.com/ae',
      embassyUrl: 'https://example.com/ae-embassy',
      entryResidence: '',
      travelRiskSafety: '',
      safetyPrecautions: '',
      riskLevel: '低风险',
      riskNote: '',
    },
    {
      mapCountryCode: 'BA',
      englishName: 'Bosnia and Herzegovina',
      chineseName: '波斯尼亚和黑塞哥维那',
      displayGroup: 'visa-required',
      rawLabel: '',
      visaFee: '',
      stayDuration: '',
      officialVisaUrl: 'https://example.com/ba',
      embassyUrl: 'https://example.com/ba-embassy',
      entryResidence: '',
      travelRiskSafety: '',
      safetyPrecautions: '',
      riskLevel: '低风险',
      riskNote: '',
    },
    {
      mapCountryCode: 'MN',
      englishName: 'Mongolia',
      chineseName: '蒙古国',
      displayGroup: 'visa-free',
      rawLabel: '',
      visaFee: '',
      stayDuration: '',
      officialVisaUrl: 'https://example.com/mn',
      embassyUrl: 'https://example.com/mn-embassy',
      entryResidence: '',
      travelRiskSafety: '',
      safetyPrecautions: '',
      riskLevel: '低风险',
      riskNote: '',
    },
    {
      mapCountryCode: 'CZ',
      englishName: 'Czech Republic',
      chineseName: '捷克共和国',
      displayGroup: 'visa-required',
      rawLabel: '',
      visaFee: '',
      stayDuration: '',
      officialVisaUrl: 'https://example.com/cz',
      embassyUrl: 'https://example.com/cz-embassy',
      entryResidence: '',
      travelRiskSafety: '',
      safetyPrecautions: '',
      riskLevel: '低风险',
      riskNote: '',
    },
    {
      mapCountryCode: 'CF',
      englishName: 'Central African Republic',
      chineseName: '中非共和国',
      displayGroup: 'visa-required',
      rawLabel: '',
      visaFee: '',
      stayDuration: '',
      officialVisaUrl: 'https://example.com/cf',
      embassyUrl: 'https://example.com/cf-embassy',
      entryResidence: '',
      travelRiskSafety: '',
      safetyPrecautions: '',
      riskLevel: '低风险',
      riskNote: '',
    },
    {
      mapCountryCode: 'PS',
      englishName: 'Palestine',
      chineseName: '巴勒斯坦领土',
      displayGroup: 'visa-required',
      rawLabel: '',
      visaFee: '',
      stayDuration: '',
      officialVisaUrl: 'https://example.com/ps',
      embassyUrl: 'https://example.com/ps-embassy',
      entryResidence: '',
      travelRiskSafety: '',
      safetyPrecautions: '',
      riskLevel: '低风险',
      riskNote: '',
    },
  ];

  const scraped = {
    countries: [
      { countryName: '阿联酋', entryResidence: { text: '阿联酋入境居留' }, travelRiskSafety: { text: '阿联酋风险等级为蓝色（低风险）' }, safetyPrecautions: { text: '阿联酋安全防范' } },
      { countryName: '波黑', entryResidence: { text: '波黑入境居留' }, travelRiskSafety: { text: '波黑风险等级为黄色（中风险）。' }, safetyPrecautions: { text: '波黑安全防范' } },
      { countryName: '蒙古', entryResidence: { text: '蒙古入境居留' }, travelRiskSafety: { text: '蒙古风险等级为蓝色（低风险）' }, safetyPrecautions: { text: '蒙古安全防范' } },
      { countryName: '捷克', entryResidence: { text: '捷克入境居留' }, travelRiskSafety: { text: '捷克风险等级为蓝色（低风险）' }, safetyPrecautions: { text: '捷克安全防范' } },
      { countryName: '中非', entryResidence: { text: '中非入境居留' }, travelRiskSafety: { text: '中非现有红色（极高风险）地区1个。' }, safetyPrecautions: { text: '中非安全防范' } },
      { countryName: '巴勒斯坦', entryResidence: { text: '巴勒斯坦入境居留' }, travelRiskSafety: { text: '巴勒斯坦风险等级为橙色（高风险）。' }, safetyPrecautions: { text: '巴勒斯坦安全防范' } },
    ],
  };

  const result = applyMfaCountrySections(countries, scraped);

  assert.equal(result.records[0].entryResidence, '阿联酋入境居留');
  assert.equal(result.records[1].entryResidence, '波黑入境居留');
  assert.equal(result.records[1].riskLevel, '中风险');
  assert.equal(result.records[2].entryResidence, '蒙古入境居留');
  assert.equal(result.records[3].entryResidence, '捷克入境居留');
  assert.equal(result.records[4].entryResidence, '中非入境居留');
  assert.equal(result.records[4].riskLevel, '请勿前往');
  assert.equal(result.records[5].entryResidence, '巴勒斯坦入境居留');
  assert.equal(result.records[5].riskLevel, '高风险');
  assert.deepEqual(result.unmatchedCountryNames, []);
  assert.equal(result.matchedCount, 6);
});
