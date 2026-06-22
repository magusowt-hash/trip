import type { PassportVisaDisplayGroup } from './passportVisaSeed.ts';

type MinimalSvgPath = {
  removeAttribute(name: string): void;
  setAttribute(name: string, value: string): void;
};

type PassportVisaMapColoringCountry = {
  mapCountryCode: string;
  displayGroup: PassportVisaDisplayGroup;
};

type ApplyPassportVisaMapPathPresentationInput = {
  country: PassportVisaMapColoringCountry | null;
  isVisible: boolean;
  noDataColor: string;
  groupColor: (group: PassportVisaDisplayGroup) => string;
};

export function applyPassportVisaMapPathPresentation(
  path: MinimalSvgPath,
  {
    country,
    isVisible,
    noDataColor,
    groupColor,
  }: ApplyPassportVisaMapPathPresentationInput,
) {
  if (!country || !isVisible) {
    path.removeAttribute('data-country-code');
    path.setAttribute('fill', noDataColor);
    return;
  }

  path.setAttribute('fill', groupColor(country.displayGroup));
  path.setAttribute('data-country-code', country.mapCountryCode);
}
