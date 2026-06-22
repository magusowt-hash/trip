import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { passportVisaCountries } from '../data/passportVisaCountries.ts';
import {
  buildPassportVisaLegendCounts,
  countMappablePassportVisaCountries,
  filterPassportVisaCountries,
  findPassportVisaCountryByMapCode,
  getPassportVisaRiskBadgeLabel,
} from './passportVisaState.ts';
test('formal passport visa frontend index exports fullscreen page and legacy entry points', () => {
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

  assert.match(source, /ChinaPassportVisaMapRightPanel/);
  assert.match(source, /PassportVisaMapView/);
  assert.match(source, /PassportVisaPage/);
});

test('legend counts sum to canonical mappable countries only', () => {
  const counts = buildPassportVisaLegendCounts(passportVisaCountries);
  const total = counts.reduce((sum, item) => sum + item.count, 0);

  assert.equal(total, countMappablePassportVisaCountries(passportVisaCountries));
});

test('saint martin is split into french and dutch entries', () => {
  const countries = passportVisaCountries.filter((country) => country.englishName === 'Saint Martin');

  assert.equal(countries.length, 2);
  assert.deepEqual(
    countries.map((country) => country.mapCountryCode).sort(),
    ['MF', 'SX'],
  );
});

test('mapped islands remain searchable in the panel', () => {
  const result = filterPassportVisaCountries(passportVisaCountries, 'wake');

  assert.equal(result.length, 1);
  assert.equal(result[0].englishName, 'Wake Island');
  assert.equal(result[0].mapCountryCode, 'UM-WQ');
});

test('query filtering matches chinese and english names', () => {
  const englishMatch = filterPassportVisaCountries(passportVisaCountries, 'japan');
  const chineseMatch = filterPassportVisaCountries(passportVisaCountries, '日本');

  assert.equal(englishMatch[0]?.mapCountryCode, 'JP');
  assert.equal(chineseMatch[0]?.mapCountryCode, 'JP');
});

test('map code lookup finds selected country entry', () => {
  const result = findPassportVisaCountryByMapCode(passportVisaCountries, 'US');

  assert.equal(result?.englishName, 'United States');
});

test('territory map code lookup resolves to sovereign country', () => {
  const result = findPassportVisaCountryByMapCode(passportVisaCountries, 'UM-WQ');

  assert.equal(result?.englishName, 'United States');
});

test('china regions are excluded from direct map lookup', () => {
  const result = findPassportVisaCountryByMapCode(passportVisaCountries, 'HK');

  assert.equal(result, null);
});

test('canonical mappable country count excludes territories and china regions', () => {
  const count = countMappablePassportVisaCountries(passportVisaCountries);

  assert.equal(count, 200);
});

test('risk badge label is shown for both low and high risk countries', () => {
  assert.equal(getPassportVisaRiskBadgeLabel(false), '低风险');
  assert.equal(getPassportVisaRiskBadgeLabel(true), '高风险');
});

test('frontend countries expose extended detail fields', () => {
  const country = passportVisaCountries.find((item) => item.mapCountryCode === 'BH');

  assert.equal(typeof country?.riskLevel, 'string');
  assert.equal(typeof country?.entryResidence, 'string');
  assert.equal(typeof country?.travelRiskSafety, 'string');
  assert.equal(typeof country?.safetyPrecautions, 'string');
  assert.equal(typeof country?.religiousLawRestrictions, 'string');
});
