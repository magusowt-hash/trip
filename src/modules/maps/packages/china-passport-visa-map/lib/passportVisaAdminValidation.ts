import type {
  PassportVisaCountryRecord,
  PassportVisaRiskLevel,
  PassportVisaScenarioRecord,
  PassportVisaThemeRecord,
  PassportVisaThemeSchemeRecord,
} from './passportVisaAdminTypes.ts';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const PASSPORT_VISA_RISK_LEVELS: PassportVisaRiskLevel[] = ['低风险', '中风险', '高风险', '请勿前往'];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertString(value: unknown, fieldName: string): asserts value is string {
  assert(typeof value === 'string', `${fieldName} must be a string`);
}

function validateUrl(value: string, fieldName: string) {
  if (!value.trim()) {
    return;
  }

  try {
    new URL(value);
  } catch {
    throw new Error(`${fieldName} must be a valid URL`);
  }
}

export function validatePassportVisaCountryRecord(record: PassportVisaCountryRecord) {
  assert(record.mapCountryCode, 'mapCountryCode is required');
  assert(record.englishName, 'englishName is required');
  assert(record.chineseName, 'chineseName is required');
  assertString(record.entryResidence, 'entryResidence');
  assertString(record.travelRiskSafety, 'travelRiskSafety');
  assertString(record.safetyPrecautions, 'safetyPrecautions');
  assertString(record.religiousLawRestrictions, 'religiousLawRestrictions');
  assert(PASSPORT_VISA_RISK_LEVELS.includes(record.riskLevel), 'riskLevel must be a valid risk level');
  validateUrl(record.officialVisaUrl, 'officialVisaUrl');
  validateUrl(record.embassyUrl, 'embassyUrl');
}

export function validatePassportVisaScenarioRecord(record: PassportVisaScenarioRecord) {
  assert(record.id, 'scenario id is required');
  assert(record.label, 'scenario label is required');
  assert(record.countryCodes.length > 0, 'scenario countryCodes must not be empty');
  assert(
    new Set(record.countryCodes).size === record.countryCodes.length,
    'scenario countryCodes must not contain duplicate values',
  );
}

export function validatePassportVisaThemeRecord(record: PassportVisaThemeRecord) {
  assert(record.label, 'theme label is required');
  for (const key of ['visaFree', 'arrivalOrEVisa', 'visaRequired', 'noData', 'stroke', 'accentStrong'] as const) {
    assert(HEX_COLOR_PATTERN.test(record[key]), `${key} must be a valid hex color`);
  }
}

export function validatePassportVisaThemeSchemeRecord(record: PassportVisaThemeSchemeRecord) {
  assert(record.activeThemeId, 'activeThemeId is required');
  assert(record.themes.length > 0, 'themes must not be empty');

  for (const theme of record.themes) {
    assert(theme.id, 'theme id is required');
    validatePassportVisaThemeRecord(theme);
  }

  assert(
    new Set(record.themes.map((theme) => theme.id)).size === record.themes.length,
    'theme ids must not contain duplicate values',
  );
  assert(
    record.themes.some((theme) => theme.id === record.activeThemeId),
    'activeThemeId must match an existing theme',
  );
}
