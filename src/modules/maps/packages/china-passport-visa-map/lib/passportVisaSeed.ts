import fs from 'node:fs';

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
  stayDuration: string;
  officialVisaUrl: string;
  embassyUrl: string;
  riskLevel: '低风险' | '中风险' | '高风险' | '请勿前往';
};

const countriesDataUrl = new URL('../data/passport-visa/countries.json', import.meta.url);

export const passportVisaSeed = JSON.parse(
  fs.readFileSync(countriesDataUrl, 'utf8'),
) as PassportVisaSeedItem[];
