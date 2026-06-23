import test from 'node:test';
import assert from 'node:assert/strict';

import { passportVisaSeed } from './passportVisaSeed.ts';
import { passportVisaScenarioDefinitions } from './passportVisaScenarioDefinitions.ts';
import {
  applyPassportVisaScenario,
  buildPassportVisaScenarioOptions,
} from './passportVisaScenarios.ts';

const passportVisaScenarioOptions = buildPassportVisaScenarioOptions(passportVisaScenarioDefinitions);

test('registers the Schengen scenario for the legend menu', () => {
  assert.deepEqual(
    passportVisaScenarioOptions.map((item) => item.id),
    ['schengen', 'us-visa', 'uk-visa', 'canada-visa', 'japan-visa', 'australia-visa'],
  );
});

test('scenario options are derived from the unified scenario definitions', () => {
  assert.deepEqual(
    passportVisaScenarioOptions,
    passportVisaScenarioDefinitions.map(({ id, label }) => ({ id, label })),
  );
});

test('scenario definitions expose editable country code arrays', () => {
  for (const scenario of passportVisaScenarioDefinitions) {
    assert.equal(typeof scenario.id, 'string');
    assert.equal(typeof scenario.label, 'string');
    assert.ok(Array.isArray(scenario.countryCodes));
    assert.ok(scenario.countryCodes.length > 0);
  }
});

test('schengen scenario uses the latest xlsx-driven country set', () => {
  const scenarioCountries = applyPassportVisaScenario(passportVisaSeed, 'schengen', passportVisaScenarioDefinitions);
  const scenarioMexico = scenarioCountries.find((country) => country.mapCountryCode === 'MX');
  const scenarioKorea = scenarioCountries.find((country) => country.mapCountryCode === 'KR');

  assert.ok(scenarioMexico);
  assert.ok(scenarioKorea);
  assert.equal(scenarioMexico.displayGroup, 'visa-free');
  assert.equal(scenarioKorea.displayGroup, 'visa-free');
});

test('schengen scenario paints matching countries as visa-free without mutating original details', () => {
  const originalAustria = passportVisaSeed.find((country) => country.mapCountryCode === 'AT');
  assert.ok(originalAustria);
  assert.equal(originalAustria.displayGroup, 'visa-required');

  const scenarioCountries = applyPassportVisaScenario(passportVisaSeed, 'schengen', passportVisaScenarioDefinitions);
  const scenarioAustria = scenarioCountries.find((country) => country.mapCountryCode === 'AT');

  assert.ok(scenarioAustria);
  assert.equal(scenarioAustria.displayGroup, 'visa-free');
  assert.equal(scenarioAustria.rawLabel, originalAustria.rawLabel);
  assert.equal(scenarioAustria.stayDuration, originalAustria.stayDuration);
  assert.equal(originalAustria.displayGroup, 'visa-required');
});

test('countries outside the scenario remain unchanged', () => {
  const originalJapan = passportVisaSeed.find((country) => country.mapCountryCode === 'JP');
  const scenarioCountries = applyPassportVisaScenario(passportVisaSeed, 'schengen', passportVisaScenarioDefinitions);
  const scenarioJapan = scenarioCountries.find((country) => country.mapCountryCode === 'JP');

  assert.ok(originalJapan);
  assert.ok(scenarioJapan);
  assert.equal(scenarioJapan.displayGroup, originalJapan.displayGroup);
  assert.equal(scenarioJapan.rawLabel, originalJapan.rawLabel);
});

test('argentina paraguay and chile are excluded from the latest schengen scenario set', () => {
  const scenarioCountries = applyPassportVisaScenario(passportVisaSeed, 'schengen', passportVisaScenarioDefinitions);

  for (const code of ['AR', 'PY', 'CL']) {
    const originalCountry = passportVisaSeed.find((country) => country.mapCountryCode === code);
    const scenarioCountry = scenarioCountries.find((country) => country.mapCountryCode === code);

    assert.ok(originalCountry);
    assert.ok(scenarioCountry);
    assert.equal(scenarioCountry.displayGroup, originalCountry.displayGroup);
  }
});

test('us visa scenario uses the latest xlsx-driven country set', () => {
  const scenarioCountries = applyPassportVisaScenario(passportVisaSeed, 'us-visa', passportVisaScenarioDefinitions);

  for (const code of ['CA', 'ST', 'MA', 'PH', 'SV', 'US']) {
    const scenarioCountry = scenarioCountries.find((country) => country.mapCountryCode === code);

    assert.ok(scenarioCountry);
    assert.equal(scenarioCountry.displayGroup, 'visa-free');
  }
});

test('countries outside the us visa scenario remain unchanged', () => {
  const originalJapan = passportVisaSeed.find((country) => country.mapCountryCode === 'JP');
  const scenarioCountries = applyPassportVisaScenario(passportVisaSeed, 'us-visa', passportVisaScenarioDefinitions);
  const scenarioJapan = scenarioCountries.find((country) => country.mapCountryCode === 'JP');

  assert.ok(originalJapan);
  assert.ok(scenarioJapan);
  assert.equal(scenarioJapan.displayGroup, originalJapan.displayGroup);
  assert.equal(scenarioJapan.rawLabel, originalJapan.rawLabel);
});

test('multiple scenarios can be combined and apply as a union', () => {
  const scenarioCountries = applyPassportVisaScenario(
    passportVisaSeed,
    ['schengen', 'us-visa'],
    passportVisaScenarioDefinitions,
  );
  const austria = scenarioCountries.find((country) => country.mapCountryCode === 'AT');
  const canada = scenarioCountries.find((country) => country.mapCountryCode === 'CA');
  const japan = scenarioCountries.find((country) => country.mapCountryCode === 'JP');

  assert.ok(austria);
  assert.ok(canada);
  assert.ok(japan);
  assert.equal(austria.displayGroup, 'visa-free');
  assert.equal(canada.displayGroup, 'visa-free');
  assert.equal(japan.displayGroup, 'visa-required');
});

test('uk visa scenario uses the latest xlsx-driven country set', () => {
  const scenarioCountries = applyPassportVisaScenario(passportVisaSeed, 'uk-visa', passportVisaScenarioDefinitions);

  for (const code of ['IE', 'GB', 'ME', 'PA', 'MX', 'UY']) {
    const scenarioCountry = scenarioCountries.find((country) => country.mapCountryCode === code);

    assert.ok(scenarioCountry);
    assert.equal(scenarioCountry.displayGroup, 'visa-free');
  }
});

test('countries outside the uk visa scenario remain unchanged', () => {
  const originalJapan = passportVisaSeed.find((country) => country.mapCountryCode === 'JP');
  const scenarioCountries = applyPassportVisaScenario(passportVisaSeed, 'uk-visa', passportVisaScenarioDefinitions);
  const scenarioJapan = scenarioCountries.find((country) => country.mapCountryCode === 'JP');

  assert.ok(originalJapan);
  assert.ok(scenarioJapan);
  assert.equal(scenarioJapan.displayGroup, originalJapan.displayGroup);
  assert.equal(scenarioJapan.rawLabel, originalJapan.rawLabel);
});

test('canada visa scenario uses the latest xlsx-driven country set', () => {
  const scenarioCountries = applyPassportVisaScenario(passportVisaSeed, 'canada-visa', passportVisaScenarioDefinitions);

  for (const code of ['CA', 'HN', 'BZ', 'CL', 'SV', 'KR']) {
    const scenarioCountry = scenarioCountries.find((country) => country.mapCountryCode === code);

    assert.ok(scenarioCountry);
    assert.equal(scenarioCountry.displayGroup, 'visa-free');
  }
});

test('countries outside the canada visa scenario remain unchanged', () => {
  const originalJapan = passportVisaSeed.find((country) => country.mapCountryCode === 'JP');
  const scenarioCountries = applyPassportVisaScenario(passportVisaSeed, 'canada-visa', passportVisaScenarioDefinitions);
  const scenarioJapan = scenarioCountries.find((country) => country.mapCountryCode === 'JP');

  assert.ok(originalJapan);
  assert.ok(scenarioJapan);
  assert.equal(scenarioJapan.displayGroup, originalJapan.displayGroup);
  assert.equal(scenarioJapan.rawLabel, originalJapan.rawLabel);
});

test('japan visa scenario uses the latest xlsx-driven country set', () => {
  const scenarioCountries = applyPassportVisaScenario(passportVisaSeed, 'japan-visa', passportVisaScenarioDefinitions);

  for (const code of ['JP', 'ME', 'MX', 'PA']) {
    const scenarioCountry = scenarioCountries.find((country) => country.mapCountryCode === code);

    assert.ok(scenarioCountry);
    assert.equal(scenarioCountry.displayGroup, 'visa-free');
  }
});

test('countries outside the japan visa scenario remain unchanged', () => {
  const originalCanada = passportVisaSeed.find((country) => country.mapCountryCode === 'CA');
  const scenarioCountries = applyPassportVisaScenario(passportVisaSeed, 'japan-visa', passportVisaScenarioDefinitions);
  const scenarioCanada = scenarioCountries.find((country) => country.mapCountryCode === 'CA');

  assert.ok(originalCanada);
  assert.ok(scenarioCanada);
  assert.equal(scenarioCanada.displayGroup, originalCanada.displayGroup);
  assert.equal(scenarioCanada.rawLabel, originalCanada.rawLabel);
});

test('australia visa scenario uses the latest xlsx-driven country set', () => {
  const scenarioCountries = applyPassportVisaScenario(passportVisaSeed, 'australia-visa', passportVisaScenarioDefinitions);

  for (const code of ['AU', 'MX', 'ME', 'PE', 'PA', 'MD', 'NZ']) {
    const scenarioCountry = scenarioCountries.find((country) => country.mapCountryCode === code);

    assert.ok(scenarioCountry);
    assert.equal(scenarioCountry.displayGroup, 'visa-free');
  }
});

test('countries outside the australia visa scenario remain unchanged', () => {
  const originalCanada = passportVisaSeed.find((country) => country.mapCountryCode === 'CA');
  const scenarioCountries = applyPassportVisaScenario(passportVisaSeed, 'australia-visa', passportVisaScenarioDefinitions);
  const scenarioCanada = scenarioCountries.find((country) => country.mapCountryCode === 'CA');

  assert.ok(originalCanada);
  assert.ok(scenarioCanada);
  assert.equal(scenarioCanada.displayGroup, originalCanada.displayGroup);
  assert.equal(scenarioCanada.rawLabel, originalCanada.rawLabel);
});
