import type { PassportVisaDisplayGroup } from './passportVisaSeed';

type PassportVisaInteractiveCountry = {
  mapCountryCode: string;
  displayGroup: PassportVisaDisplayGroup;
};

export function isPassportVisaCountryInteractive(country: PassportVisaInteractiveCountry | null | undefined) {
  if (!country) {
    return false;
  }

  return country.displayGroup !== 'region-neutral';
}
