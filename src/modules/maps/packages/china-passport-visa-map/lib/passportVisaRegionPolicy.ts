export const passportVisaDisabledRegionCodes = new Set([
  'CN',
  'HK',
  'MO',
  'TW',
]);

export const passportVisaTerritorySovereignMap: Record<string, string> = {
  AI: 'GB',
  AS: 'US',
  AW: 'NL',
  AX: 'FI',
  BL: 'FR',
  BM: 'GB',
  BQ: 'NL',
  BV: 'NO',
  CC: 'AU',
  CK: 'NZ',
  CW: 'NL',
  CX: 'AU',
  FK: 'GB',
  FO: 'DK',
  GF: 'FR',
  GG: 'GB',
  GI: 'GB',
  GL: 'DK',
  GP: 'FR',
  GS: 'GB',
  GU: 'US',
  IM: 'GB',
  IO: 'GB',
  JE: 'GB',
  KY: 'GB',
  MF: 'FR',
  MP: 'US',
  MQ: 'FR',
  MS: 'GB',
  NC: 'FR',
  NF: 'AU',
  NU: 'NZ',
  PF: 'FR',
  PM: 'FR',
  PN: 'GB',
  PR: 'US',
  RE: 'FR',
  SH: 'GB',
  SJ: 'NO',
  SX: 'NL',
  TC: 'GB',
  TK: 'NZ',
  'UM-DQ': 'US',
  'UM-FQ': 'US',
  'UM-HQ': 'US',
  'UM-JQ': 'US',
  'UM-MQ': 'US',
  'UM-WQ': 'US',
  VG: 'GB',
  VI: 'US',
  WF: 'FR',
  YT: 'FR',
};

export function resolvePassportVisaCountryCode(regionCode: string | null | undefined) {
  if (!regionCode) {
    return null;
  }

  if (passportVisaDisabledRegionCodes.has(regionCode)) {
    return regionCode;
  }

  return passportVisaTerritorySovereignMap[regionCode] ?? regionCode;
}

export function isPassportVisaCanonicalRegion(regionCode: string | null | undefined) {
  if (!regionCode) {
    return false;
  }

  if (passportVisaDisabledRegionCodes.has(regionCode)) {
    return true;
  }

  return !(regionCode in passportVisaTerritorySovereignMap);
}

export function isPassportVisaInteractiveRegion(regionCode: string | null | undefined) {
  return Boolean(resolvePassportVisaCountryCode(regionCode));
}
