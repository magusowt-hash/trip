import type {
  PassportVisaCountryRecord,
  PassportVisaScenarioRecord,
} from './passportVisaAdminTypes.ts';

export type PassportVisaScenarioId = string;

export type PassportVisaScenarioOption = {
  id: PassportVisaScenarioId;
  label: string;
};

export function buildPassportVisaScenarioOptions(
  scenarioDefinitions: PassportVisaScenarioRecord[],
): PassportVisaScenarioOption[] {
  return scenarioDefinitions.map(({ id, label }) => ({ id, label }));
}

export function applyPassportVisaScenario(
  countries: PassportVisaCountryRecord[],
  scenarioIds: PassportVisaScenarioId | PassportVisaScenarioId[] | null,
  scenarioDefinitions: PassportVisaScenarioRecord[],
) {
  if (!scenarioIds || (Array.isArray(scenarioIds) && scenarioIds.length === 0)) {
    return countries;
  }

  const activeScenarioIds = Array.isArray(scenarioIds) ? scenarioIds : [scenarioIds];
  const scenarioCountryCodeMap = Object.fromEntries(
    scenarioDefinitions.map(({ id, countryCodes }) => [id, new Set(countryCodes)]),
  ) as Record<PassportVisaScenarioId, Set<string>>;
  const activeScenarioCountryCodes = activeScenarioIds
    .map((scenarioId) => scenarioCountryCodeMap[scenarioId])
    .filter(Boolean);

  return countries.map((country) => (
    activeScenarioCountryCodes.some((scenarioCountryCodes) => scenarioCountryCodes.has(country.mapCountryCode))
      ? {
          ...country,
          displayGroup: 'visa-free' as const,
        }
      : country
  ));
}
