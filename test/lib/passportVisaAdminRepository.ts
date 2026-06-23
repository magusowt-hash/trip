import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type {
  PassportVisaCountryRecord,
  PassportVisaRiskLevel,
  PassportVisaScenarioRecord,
  PassportVisaThemeRecord,
  PassportVisaThemeSchemeRecord,
} from './passportVisaAdminTypes';

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
  visaRequirement: string;
  stayDuration: string;
  officialVisaUrl: string;
  riskLevel?: PassportVisaRiskLevel;
  entryResidence?: string;
  travelRiskSafety?: string;
  safetyPrecautions?: string;
  religiousLawRestrictions?: string;
  isHighRisk?: boolean;
  highRiskNote?: string;
  riskNote?: string;
  embassyUrl: string;
};

type PassportVisaAdminFileRepositoryOptions = {
  countriesPath: URL;
  countriesDetailsPath?: URL;
  scenariosPath: URL;
  themePath: URL;
};

const repositoryDirectoryPath = path.dirname(fileURLToPath(import.meta.url));
const workspaceRootPath = path.resolve(repositoryDirectoryPath, '..', '..');
const frontendCountriesPath = pathToFileURL(path.join(
  workspaceRootPath,
  'test/data/passport-visa/countries.json',
));

const defaultRepositoryOptions: PassportVisaAdminFileRepositoryOptions = {
  countriesPath: frontendCountriesPath,
  scenariosPath: new URL('../data/passport-visa/scenarios.json', import.meta.url),
  themePath: new URL('../data/passport-visa/theme.json', import.meta.url),
};

async function readJsonFile<T>(filePath: URL): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

async function readTextFile(filePath: URL) {
  return fs.readFile(filePath, 'utf8');
}

async function writeJsonFile(filePath: URL, value: unknown) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeTextFile(filePath: URL, value: string) {
  await fs.writeFile(filePath, value, 'utf8');
}

function inferEntrySlug(record: PassportVisaCountryRecord) {
  return record.mapCountryCode.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function mapDisplayGroupToFrontendGroup(
  record: PassportVisaCountryRecord,
  displayGroup: PassportVisaCountryRecord['displayGroup'],
): PassportVisaCategoryGroup {
  if (displayGroup === 'visa-free') {
    return 'visa-free';
  }
  if (displayGroup === 'region-neutral') {
    return 'region-neutral';
  }
  if (displayGroup === 'visa-required') {
    return 'visa-required';
  }

  return /电子签|e-visa/i.test(record.rawLabel) ? 'e-visa' : 'visa-on-arrival';
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

function mapFrontendCountryToAdminRecord(country: PassportVisaCountry): PassportVisaCountryRecord {
  const riskLevel: PassportVisaRiskLevel = country.riskLevel
    ?? (country.isHighRisk ? '高风险' : '低风险');

  return {
    mapCountryCode: country.mapCountryCode ?? '',
    englishName: country.englishName,
    chineseName: country.chineseName,
    displayGroup: mapFrontendGroupToDisplayGroup(country.visaCategoryGroup),
    rawLabel: country.visaCategoryRaw,
    visaFee: country.visaFee,
    visaRequirement: country.visaRequirement,
    stayDuration: country.stayDuration,
    officialVisaUrl: country.officialVisaUrl,
    embassyUrl: country.embassyUrl,
    entryResidence: country.entryResidence ?? '',
    travelRiskSafety: country.travelRiskSafety ?? '',
    safetyPrecautions: country.safetyPrecautions ?? '',
    religiousLawRestrictions: country.religiousLawRestrictions ?? '',
    riskLevel,
    riskNote: country.highRiskNote ?? country.riskNote ?? '',
  };
}

function isAdminCountryRecordArray(value: unknown): value is PassportVisaCountryRecord[] {
  return Array.isArray(value)
    && value.every((item) => (
      item
      && typeof item === 'object'
      && 'displayGroup' in item
      && 'rawLabel' in item
      && 'mapCountryCode' in item
    ));
}

function buildFrontendCountryFromRecord(record: PassportVisaCountryRecord): PassportVisaCountry {
  return {
    entrySlug: inferEntrySlug(record),
    mapCountryCode: record.mapCountryCode || null,
    englishName: record.englishName,
    chineseName: record.chineseName,
    visaCategoryRaw: record.rawLabel,
    visaCategoryGroup: mapDisplayGroupToFrontendGroup(record, record.displayGroup),
    visaFee: record.visaFee,
    visaRequirement: record.visaRequirement,
    stayDuration: record.stayDuration,
    officialVisaUrl: record.officialVisaUrl,
    riskLevel: record.riskLevel,
    entryResidence: record.entryResidence,
    travelRiskSafety: record.travelRiskSafety,
    safetyPrecautions: record.safetyPrecautions,
    religiousLawRestrictions: record.religiousLawRestrictions,
    isHighRisk: record.riskLevel !== '低风险',
    highRiskNote: record.riskNote ?? '',
    embassyUrl: record.embassyUrl,
  };
}

function parseFrontendCountriesModule(source: string) {
  const moduleMatch = source.match(/export const passportVisaCountries: PassportVisaCountry\[] = (\[[\s\S]*\]);\s*$/);
  if (!moduleMatch) {
    throw new Error('Invalid frontend countries module');
  }

  return JSON.parse(moduleMatch[1]) as PassportVisaCountry[];
}

function serializeFrontendCountriesModule(countries: PassportVisaCountry[]) {
  return `import type { PassportVisaCountry } from './passportVisaTypes.ts';

export const passportVisaCountries: PassportVisaCountry[] = ${JSON.stringify(countries, null, 2)};
`;
}

async function readCountriesData(filePath: URL) {
  if (filePath.pathname.endsWith('.json')) {
    return readJsonFile<unknown>(filePath);
  }

  return parseFrontendCountriesModule(await readTextFile(filePath));
}

export function createPassportVisaAdminFileRepository(options: PassportVisaAdminFileRepositoryOptions) {
  return {
    async listCountries() {
      const countriesData = await readCountriesData(options.countriesPath);
      if (isAdminCountryRecordArray(countriesData)) {
        return countriesData;
      }

      return (countriesData as PassportVisaCountry[]).map(mapFrontendCountryToAdminRecord);
    },
    async saveCountries(records: PassportVisaCountryRecord[]) {
      const countriesData = await readCountriesData(options.countriesPath);
      if (isAdminCountryRecordArray(countriesData)) {
        await writeJsonFile(options.countriesPath, records);
        return;
      }

      const nextFrontendCountries = records.map(buildFrontendCountryFromRecord);
      await writeTextFile(
        options.countriesPath,
        serializeFrontendCountriesModule(nextFrontendCountries),
      );
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
