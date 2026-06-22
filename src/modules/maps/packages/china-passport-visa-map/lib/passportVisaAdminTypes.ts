import type { PassportVisaDisplayGroup } from './passportVisaSeed.ts';

export type PassportVisaRiskLevel =
  | '低风险'
  | '中风险'
  | '高风险'
  | '请勿前往';

export type PassportVisaCountryRecord = {
  mapCountryCode: string;
  englishName: string;
  chineseName: string;
  displayGroup: PassportVisaDisplayGroup;
  rawLabel: string;
  visaFee: string;
  stayDuration: string;
  officialVisaUrl: string;
  embassyUrl: string;
  entryResidence: string;
  travelRiskSafety: string;
  safetyPrecautions: string;
  religiousLawRestrictions: string;
  riskLevel: PassportVisaRiskLevel;
};

export type PassportVisaScenarioRecord = {
  id: string;
  label: string;
  countryCodes: string[];
};

export type PassportVisaThemeRecord = {
  id?: string;
  label: string;
  visaFree: string;
  arrivalOrEVisa: string;
  visaRequired: string;
  noData: string;
  stroke: string;
  accentStrong: string;
};

export type PassportVisaThemeSchemeRecord = {
  activeThemeId: string;
  themes: Array<PassportVisaThemeRecord & { id: string }>;
};

export type PassportVisaBootstrapPayload = {
  countries: PassportVisaCountryRecord[];
  scenarios: PassportVisaScenarioRecord[];
  theme: PassportVisaThemeRecord;
};
