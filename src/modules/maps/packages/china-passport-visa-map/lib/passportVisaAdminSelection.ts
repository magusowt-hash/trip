import { passportVisaTerritorySovereignMap } from './passportVisaRegionPolicy.ts';

export function getPassportVisaAdminEditTargetCode(regionCode: string | null | undefined) {
  if (!regionCode) {
    return null;
  }

  return passportVisaTerritorySovereignMap[regionCode] ?? regionCode;
}

export function hasPassportVisaAdminCountryRedirect(regionCode: string | null | undefined) {
  if (!regionCode) {
    return false;
  }

  return regionCode in passportVisaTerritorySovereignMap;
}

export function sortPassportVisaAdminCountries<T extends { mapCountryCode: string }>(countries: T[]) {
  return [...countries].sort((left, right) => {
    const leftRedirect = hasPassportVisaAdminCountryRedirect(left.mapCountryCode);
    const rightRedirect = hasPassportVisaAdminCountryRedirect(right.mapCountryCode);

    if (leftRedirect === rightRedirect) {
      return 0;
    }

    return leftRedirect ? 1 : -1;
  });
}
