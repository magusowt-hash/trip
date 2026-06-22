import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const countriesPath = path.resolve(scriptDir, '../test/data/passport-visa/countries.json');
const scrapedPath = path.resolve(scriptDir, '../data/mfa-country-info.json');
const COUNTRY_NAME_ALIASES = new Map([
  ['阿联酋', '阿拉伯联合酋长国'],
  ['波黑', '波斯尼亚和黑塞哥维那'],
  ['蒙古', '蒙古国'],
  ['捷克', '捷克共和国'],
  ['中非', '中非共和国'],
  ['巴勒斯坦', '巴勒斯坦领土'],
]);

export function inferRiskLevelFromTravelRiskSafety(text) {
  if (!text) {
    return '低风险';
  }

  if (text.includes('极高风险')) {
    return '请勿前往';
  }

  if (text.includes('高风险')) {
    return '高风险';
  }

  if (text.includes('中风险')) {
    return '中风险';
  }

  return '低风险';
}

function normalizeCountryName(name) {
  return (name ?? '')
    .replace(/\(/g, '（')
    .replace(/\)/g, '）')
    .trim();
}

function canonicalCountryName(name) {
  const normalized = normalizeCountryName(name);
  return COUNTRY_NAME_ALIASES.get(normalized) ?? normalized;
}

export function applyMfaCountrySections(countries, scrapedData) {
  const scrapedMap = new Map(
    (scrapedData.countries ?? []).map((country) => [canonicalCountryName(country.countryName), country]),
  );

  let matchedCount = 0;
  const unmatchedCountryNames = [];

  const records = countries.map((country) => {
    const scraped = scrapedMap.get(canonicalCountryName(country.chineseName));
    if (!scraped) {
      unmatchedCountryNames.push(country.chineseName);
      return {
        ...country,
        entryResidence: '',
        travelRiskSafety: '',
        safetyPrecautions: '',
      };
    }

    matchedCount += 1;
    const travelRiskSafety = scraped.travelRiskSafety?.text || '';
    return {
      ...country,
      entryResidence: scraped.entryResidence?.text || '',
      travelRiskSafety,
      safetyPrecautions: scraped.safetyPrecautions?.text || '',
      riskLevel: inferRiskLevelFromTravelRiskSafety(travelRiskSafety),
    };
  });

  return {
    records,
    matchedCount,
    unmatchedCountryNames,
  };
}

async function main() {
  const countries = JSON.parse(await fs.readFile(countriesPath, 'utf8'));
  const scrapedData = JSON.parse(await fs.readFile(scrapedPath, 'utf8'));
  const result = applyMfaCountrySections(countries, scrapedData);

  await fs.writeFile(countriesPath, `${JSON.stringify(result.records, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    matchedCount: result.matchedCount,
    totalCountries: result.records.length,
    unmatchedCountryNames: result.unmatchedCountryNames,
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
