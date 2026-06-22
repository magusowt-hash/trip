import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type {
  PassportVisaCountryRecord,
  PassportVisaRiskLevel,
  PassportVisaScenarioRecord,
  PassportVisaThemeRecord,
  PassportVisaThemeSchemeRecord,
} from './passportVisaAdminTypes.ts';

type PassportVisaCategoryGroup =
  | 'region-neutral'
  | 'visa-free'
  | 'visa-on-arrival'
  | 'e-visa'
  | 'conditional-entry'
  | 'visa-required'
  | 'special-restriction';

type PassportVisaCountry = {
  entrySlug: string;
  mapCountryCode: string | null;
  englishName: string;
  chineseName: string;
  visaCategoryRaw: string;
  visaCategoryGroup: PassportVisaCategoryGroup;
  visaFee: string;
  stayDuration: string;
  officialVisaUrl: string;
  riskLevel: PassportVisaRiskLevel;
  entryResidence: string;
  travelRiskSafety: string;
  safetyPrecautions: string;
  religiousLawRestrictions: string;
  isHighRisk: boolean;
  highRiskNote: string;
  embassyUrl: string;
};

type PassportVisaAdminFileRepositoryOptions = {
  countriesPath: URL;
  scenariosPath: URL;
  themePath: URL;
};

const repositoryDirectoryPath = path.dirname(fileURLToPath(import.meta.url));
const workspaceRootPath = path.resolve(repositoryDirectoryPath, '..', '..');
const frontendCountriesPath = pathToFileURL(path.join(
  workspaceRootPath,
  'src/modules/maps/packages/china-passport-visa-map/data/passportVisaCountries.ts',
));

const defaultRepositoryOptions: PassportVisaAdminFileRepositoryOptions = {
  countriesPath: frontendCountriesPath,
  scenariosPath: new URL('../data/passport-visa/scenarios.json', import.meta.url),
  themePath: new URL('../data/passport-visa/theme.json', import.meta.url),
};

const FRONTEND_COUNTRIES_EXPORT_PATTERN =
  /export const passportVisaCountries: PassportVisaCountry\[] = (\[[\s\S]*\]);\s*$/;

async function readJsonFile<T>(filePath: URL): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

async function writeJsonFile(filePath: URL, value: unknown) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function parseFrontendCountriesModule(source: string) {
  const match = source.match(FRONTEND_COUNTRIES_EXPORT_PATTERN);
  if (!match) {
    throw new Error('passportVisaCountries export not found');
  }

  return JSON.parse(match[1]) as PassportVisaCountry[];
}

function serializeFrontendCountriesModule(countries: PassportVisaCountry[]) {
  return [
    "import type { PassportVisaCountry } from './passportVisaTypes.ts';",
    '',
    'export const passportVisaCountries: PassportVisaCountry[] = [',
    ...countries.map((country, index) => {
      const json = JSON.stringify(country, null, 2)
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n');
      const suffix = index === countries.length - 1 ? '' : ',';
      return `${json}${suffix}`;
    }),
    '];',
    '',
  ].join('\n');
}

function inferEntrySlug(record: PassportVisaCountryRecord) {
  return record.mapCountryCode.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function mapFrontendGroupToDisplayGroup(group: PassportVisaCategoryGroup): PassportVisaCountryRecord['displayGroup'] {
  if (group === 'visa-free') {
    return 'visa-free';
  }
  if (group === 'region-neutral') {
    return 'region-neutral';
  }
  if (group === 'visa-required') {
    return 'visa-required';
  }
  return 'arrival-or-evisa';
}

function mapDisplayGroupToFrontendGroup(
  record: PassportVisaCountryRecord,
  displayGroup: PassportVisaCountryRecord['displayGroup'],
  existingGroup?: PassportVisaCategoryGroup,
): PassportVisaCategoryGroup {
  if (displayGroup === 'visa-free') {
    return 'visa-free';
  }
  if (displayGroup === 'region-neutral') {
    return 'region-neutral';
  }
  if (displayGroup === 'visa-required') {
    if (existingGroup === 'conditional-entry' || existingGroup === 'special-restriction') {
      return existingGroup;
    }
    return 'visa-required';
  }

  if (existingGroup === 'visa-on-arrival' || existingGroup === 'e-visa') {
    return existingGroup;
  }

  return recordRawLabelLooksLikeEVisa(record.rawLabel) ? 'e-visa' : 'visa-on-arrival';
}

function recordRawLabelLooksLikeEVisa(rawLabel: string) {
  return /电子签|e-visa/i.test(rawLabel);
}

function mapFrontendCountryToAdminRecord(
  country: PassportVisaCountry,
): PassportVisaCountryRecord {
  return {
    mapCountryCode: country.mapCountryCode ?? '',
    englishName: country.englishName,
    chineseName: country.chineseName,
    displayGroup: mapFrontendGroupToDisplayGroup(country.visaCategoryGroup),
    rawLabel: country.visaCategoryRaw,
    visaFee: country.visaFee,
    stayDuration: country.stayDuration,
    officialVisaUrl: country.officialVisaUrl,
    embassyUrl: country.embassyUrl,
    entryResidence: country.entryResidence,
    travelRiskSafety: country.travelRiskSafety,
    safetyPrecautions: country.safetyPrecautions,
    religiousLawRestrictions: country.religiousLawRestrictions,
    riskLevel: country.riskLevel,
  };
}

function buildFrontendCountryFromRecord(
  record: PassportVisaCountryRecord,
  existingCountry: PassportVisaCountry | undefined,
): PassportVisaCountry {
  const existingGroup = existingCountry?.visaCategoryGroup;
  const visaCategoryGroup = mapDisplayGroupToFrontendGroup(record, record.displayGroup, existingGroup);

  return {
    entrySlug: existingCountry?.entrySlug ?? inferEntrySlug(record),
    mapCountryCode: record.mapCountryCode || null,
    englishName: record.englishName,
    chineseName: record.chineseName,
    visaCategoryRaw: record.rawLabel,
    visaCategoryGroup,
    visaFee: record.visaFee,
    stayDuration: record.stayDuration,
    officialVisaUrl: record.officialVisaUrl,
    riskLevel: record.riskLevel,
    entryResidence: record.entryResidence,
    travelRiskSafety: record.travelRiskSafety,
    safetyPrecautions: record.safetyPrecautions,
    religiousLawRestrictions: record.religiousLawRestrictions,
    isHighRisk: record.riskLevel !== '低风险',
    highRiskNote: existingCountry?.highRiskNote ?? '',
    embassyUrl: record.embassyUrl,
  };
}

async function listFrontendCountries(countriesPath: URL) {
  const raw = await fs.readFile(countriesPath, 'utf8');
  return parseFrontendCountriesModule(raw);
}

async function saveFrontendCountries(countriesPath: URL, countries: PassportVisaCountry[]) {
  await fs.writeFile(countriesPath, serializeFrontendCountriesModule(countries), 'utf8');
}

function sortCountriesByFrontendOrder<T extends { mapCountryCode: string | null }>(
  records: T[],
  frontendCountries: PassportVisaCountry[],
) {
  const order = new Map(frontendCountries.map((country, index) => [country.mapCountryCode ?? '', index]));

  return [...records].sort((left, right) => {
    const leftCode = left.mapCountryCode ?? '';
    const rightCode = right.mapCountryCode ?? '';
    const leftIndex = order.get(leftCode) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = order.get(rightCode) ?? Number.MAX_SAFE_INTEGER;

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return leftCode.localeCompare(rightCode);
  });
}

export function createPassportVisaAdminFileRepository(options: PassportVisaAdminFileRepositoryOptions) {
  return {
    async listCountries() {
      const frontendCountries = await listFrontendCountries(options.countriesPath);

      return frontendCountries.map((country) => mapFrontendCountryToAdminRecord(country));
    },
    async saveCountries(records: PassportVisaCountryRecord[]) {
      const frontendCountries = await listFrontendCountries(options.countriesPath);
      const existingCountriesByCode = new Map(frontendCountries.map((country) => [country.mapCountryCode ?? '', country]));
      const nextFrontendCountries = records.map((record) => buildFrontendCountryFromRecord(
        record,
        existingCountriesByCode.get(record.mapCountryCode),
      ));
      await saveFrontendCountries(options.countriesPath, sortCountriesByFrontendOrder(nextFrontendCountries, frontendCountries));
    },
    async listScenarios() {
      return readJsonFile<PassportVisaScenarioRecord[]>(options.scenariosPath);
    },
    async saveScenarios(records: PassportVisaScenarioRecord[]) {
      await writeJsonFile(options.scenariosPath, records);
    },
    async getTheme() {
      const themeScheme = await readJsonFile<PassportVisaThemeSchemeRecord>(options.themePath);
      const activeTheme = themeScheme.themes.find((theme) => theme.id === themeScheme.activeThemeId);

      if (!activeTheme) {
        throw new Error('Active theme not found');
      }

      return activeTheme;
    },
    async saveTheme(record: PassportVisaThemeRecord) {
      const themeScheme = await readJsonFile<PassportVisaThemeSchemeRecord>(options.themePath);
      const activeThemeIndex = themeScheme.themes.findIndex((theme) => theme.id === themeScheme.activeThemeId);

      if (activeThemeIndex < 0) {
        throw new Error('Active theme not found');
      }

      themeScheme.themes[activeThemeIndex] = {
        ...record,
        id: themeScheme.activeThemeId,
      };
      await writeJsonFile(options.themePath, themeScheme);
    },
    async getThemeScheme() {
      return readJsonFile<PassportVisaThemeSchemeRecord>(options.themePath);
    },
    async saveThemeScheme(record: PassportVisaThemeSchemeRecord) {
      await writeJsonFile(options.themePath, record);
    },
  };
}

export function createDefaultPassportVisaAdminFileRepository() {
  return createPassportVisaAdminFileRepository(defaultRepositoryOptions);
}
