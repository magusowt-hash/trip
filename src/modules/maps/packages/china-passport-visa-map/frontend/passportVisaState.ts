import { passportVisaLegend } from '../data/passportVisaLegend.ts';
import {
  isPassportVisaCanonicalRegion,
  resolvePassportVisaCountryCode,
} from '../data/passportVisaRegionPolicy.ts';
import type {
  PassportVisaCategoryGroup,
  PassportVisaCountry,
  PassportVisaLegendItem,
} from '../data/passportVisaTypes.ts';

export type PassportVisaLegendCount = PassportVisaLegendItem & {
  count: number;
};

function normalizeQuery(query: string) {
  return query.trim().toLowerCase();
}

export function buildPassportVisaLegendCounts(countries: PassportVisaCountry[]): PassportVisaLegendCount[] {
  const counts = new Map<PassportVisaCategoryGroup, number>();

  for (const country of countries) {
    if (!isPassportVisaCanonicalRegion(country.mapCountryCode)) {
      continue;
    }
    counts.set(country.visaCategoryGroup, (counts.get(country.visaCategoryGroup) ?? 0) + 1);
  }

  return passportVisaLegend.map((item) => ({
    ...item,
    count: counts.get(item.group) ?? 0,
  }));
}

export function findPassportVisaCountryByMapCode(
  countries: PassportVisaCountry[],
  mapCountryCode: string | null | undefined,
) {
  const resolvedCode = resolvePassportVisaCountryCode(mapCountryCode);
  if (!resolvedCode) {
    return null;
  }

  return countries.find((country) => country.mapCountryCode === resolvedCode) ?? null;
}

export function filterPassportVisaCountries(countries: PassportVisaCountry[], query: string) {
  const normalized = normalizeQuery(query);
  if (!normalized) {
    return [];
  }

  return countries.filter((country) => {
    const english = country.englishName.toLowerCase();
    const chinese = country.chineseName.toLowerCase();
    return english.includes(normalized) || chinese.includes(normalized);
  });
}

export function countMappablePassportVisaCountries(countries: PassportVisaCountry[]) {
  return countries.filter((country) => isPassportVisaCanonicalRegion(country.mapCountryCode)).length;
}

export function getPassportVisaRiskBadgeLabel(isHighRisk: boolean) {
  return isHighRisk ? '高风险' : '低风险';
}
