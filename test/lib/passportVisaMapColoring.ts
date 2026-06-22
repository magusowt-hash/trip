import type { PassportVisaDisplayGroup } from './passportVisaSeed';

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

type ApplyPassportVisaMapPathPresentationPageInput = {
  baseFill: string;
  isActive: boolean;
  isFaded: boolean;
};

export function applyPassportVisaMapPathPresentation(
  path: MinimalSvgPath,
  input: ApplyPassportVisaMapPathPresentationInput | ApplyPassportVisaMapPathPresentationPageInput,
) {
  if ('baseFill' in input) {
    path.setAttribute('fill', input.baseFill);
    path.setAttribute('opacity', input.isFaded ? '0.34' : '1');
    path.setAttribute('stroke-width', input.isActive ? '1.5' : '0.9');
    return;
  }

  const {
    country,
    isVisible,
    noDataColor,
    groupColor,
  } = input;

  if (!country || !isVisible) {
    path.removeAttribute('data-country-code');
    path.setAttribute('fill', noDataColor);
    return;
  }

  path.setAttribute('fill', groupColor(country.displayGroup));
  path.setAttribute('data-country-code', country.mapCountryCode);
}
