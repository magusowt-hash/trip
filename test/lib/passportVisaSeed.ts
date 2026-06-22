import countries from '../data/passport-visa/countries.json';
import type { PassportVisaRiskLevel } from './passportVisaAdminTypes';

export type PassportVisaDisplayGroup =
  | 'region-neutral'
  | 'visa-free'
  | 'arrival-or-evisa'
  | 'visa-required';

export type PassportVisaSeedItem = {
  mapCountryCode: string;
  englishName: string;
  chineseName: string;
  displayGroup: PassportVisaDisplayGroup;
  rawLabel: string;
  visaFee: string;
  visaRequirement: string;
  stayDuration: string;
  officialVisaUrl: string;
  embassyUrl: string;
  riskLevel: PassportVisaRiskLevel;
  entryResidence: string;
  travelRiskSafety: string;
  safetyPrecautions: string;
  religiousLawRestrictions: string;
};

const rawCountries = countries as Array<Partial<PassportVisaSeedItem> & {
  mapCountryCode: string;
  englishName: string;
  chineseName: string;
  displayGroup: PassportVisaDisplayGroup;
  rawLabel: string;
  visaFee: string;
  stayDuration: string;
  officialVisaUrl: string;
  embassyUrl: string;
  riskLevel?: PassportVisaRiskLevel;
  entryResidence?: string;
  travelRiskSafety?: string;
  safetyPrecautions?: string;
  religiousLawRestrictions?: string;
}>;

export const passportVisaSeed = rawCountries.map((country) => ({
  mapCountryCode: country.mapCountryCode,
  englishName: country.englishName,
  chineseName: country.chineseName,
  displayGroup: country.displayGroup,
  rawLabel: country.rawLabel,
  visaFee: country.visaFee,
  visaRequirement: country.visaRequirement ?? '',
  stayDuration: country.stayDuration,
  officialVisaUrl: country.officialVisaUrl,
  embassyUrl: country.embassyUrl,
  riskLevel: country.riskLevel ?? '低风险',
  entryResidence: country.entryResidence ?? '',
  travelRiskSafety: country.travelRiskSafety ?? '',
  safetyPrecautions: country.safetyPrecautions ?? '',
  religiousLawRestrictions: country.religiousLawRestrictions ?? '',
})) satisfies PassportVisaSeedItem[];
