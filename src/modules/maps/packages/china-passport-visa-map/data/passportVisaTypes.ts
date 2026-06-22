export type PassportVisaCategoryGroup =
  | 'region-neutral'
  | 'visa-free'
  | 'visa-on-arrival'
  | 'e-visa'
  | 'conditional-entry'
  | 'visa-required'
  | 'special-restriction';

export type PassportVisaRiskLevel =
  | '低风险'
  | '中风险'
  | '高风险'
  | '请勿前往';

export type PassportVisaCountry = {
  entrySlug: string;
  mapCountryCode: string | null;
  englishName: string;
  chineseName: string;
  visaCategoryRaw: string;
  visaCategoryGroup: PassportVisaCategoryGroup;
  visaFee: string;
  stayDuration: string;
  officialVisaUrl: string;
  riskLevel: PassportVisaRiskLevel;
  entryResidence: string;
  travelRiskSafety: string;
  safetyPrecautions: string;
  religiousLawRestrictions: string;
  isHighRisk: boolean;
  highRiskNote: string;
  embassyUrl: string;
};

export type PassportVisaLegendItem = {
  group: PassportVisaCategoryGroup;
  label: string;
  color: string;
};
