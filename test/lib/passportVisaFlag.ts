export function getPassportVisaFlagSrc(countryCode: string) {
  return `/svg/${countryCode.toLowerCase()}.svg`;
}
