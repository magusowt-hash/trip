import type { PassportVisaCountryRecord } from './passportVisaAdminTypes.ts';
import type { PassportVisaDisplayGroup } from './passportVisaSeed.ts';
import { isPassportVisaCanonicalRegion } from './passportVisaRegionPolicy.ts';

export type PassportVisaFilterMode = 'all' | PassportVisaDisplayGroup | 'high-risk';

export type PassportVisaLegendFilterItem = {
  key: PassportVisaFilterMode;
  label: string;
  count: number;
};

export function buildPassportVisaLegendFilterItems(countries: PassportVisaCountryRecord[]) {
  const canonicalCountries = countries.filter((country) => isPassportVisaCanonicalRegion(country.mapCountryCode));
  const visaFreeCount = canonicalCountries.filter((country) => country.displayGroup === 'visa-free').length;
  const arrivalOrEVisaCount = canonicalCountries.filter((country) => country.displayGroup === 'arrival-or-evisa').length;
  const visaRequiredCount = canonicalCountries.filter((country) => country.displayGroup === 'visa-required').length;

  return [
    { key: 'visa-free', label: '免签', count: visaFreeCount },
    { key: 'arrival-or-evisa', label: '落地签 / 电子签', count: arrivalOrEVisaCount },
    { key: 'visa-required', label: '需签证', count: visaRequiredCount },
  ] satisfies PassportVisaLegendFilterItem[];
}
