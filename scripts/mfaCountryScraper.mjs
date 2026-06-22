import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LANDING_URL = 'https://cs.mfa.gov.cn/zggmcg/ljmdd/';
const DEFAULT_OUTPUT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../data/mfa-country-info.json',
);

const SECTION_CONFIG = {
  entryResidence: {
    id: 'con_a_2',
    fallbackHeading: '入境居留',
  },
  travelRiskSafety: {
    id: 'con_a_7',
    fallbackHeading: '旅行风险等级和安全提醒',
  },
  safetyPrecautions: {
    id: 'con_a_3',
    fallbackHeading: '安全防范',
  },
};

const REGION_NAMES = new Set(['亚洲', '欧洲', '非洲', '北美洲', '南美洲', '大洋洲']);

export function parseLandingPage(html, baseUrl = LANDING_URL) {
  const regionMap = new Map();
  const linkPattern = /<a\s+href="([^"]+\/zggmcg\/ljmdd\/[^"]+\/|[^"]+\/ljmdd\/[^"]+\/|\.\/[^"]+\/)"[^>]*>([^<]+)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const [, href, rawName] = match;
    const name = decodeHtmlEntities(rawName).trim();
    if (!REGION_NAMES.has(name)) {
      continue;
    }
    const url = new URL(href, baseUrl).href;
    if (!/\/zggmcg\/ljmdd\/[^/]+\/$/.test(url)) {
      continue;
    }
    regionMap.set(name, { name, url });
  }

  return [...regionMap.values()];
}

export function parseRegionPage(html, baseUrl) {
  const regionName = firstMatch(html, /<div class="lm_country">\s*([^<]+?)\s*<\/div>/i) ?? '';
  const countryListBlock = extractFirstDivWithClass(html, 'country_list');
  const countries = [];
  const seen = new Set();

  if (countryListBlock) {
    const anchorPattern = /<p>\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>\s*<\/p>/gi;
    for (const match of countryListBlock.matchAll(anchorPattern)) {
      const [, href, rawName] = match;
      const name = decodeHtmlEntities(rawName).trim();
      const url = new URL(href, baseUrl).href;
      if (!name || seen.has(url)) {
        continue;
      }
      seen.add(url);
      countries.push({ name, url });
    }
  }

  return { regionName, countries };
}

export function extractCountrySections(html) {
  const countryName = decodeHtmlEntities(firstMatch(html, /<dd class="text">\s*([^<]+?)\s*<\/dd>/i) ?? '').trim();

  return {
    countryName,
    entryResidence: extractSection(html, SECTION_CONFIG.entryResidence),
    travelRiskSafety: extractSection(html, SECTION_CONFIG.travelRiskSafety),
    safetyPrecautions: extractSection(html, SECTION_CONFIG.safetyPrecautions),
  };
}

function extractSection(html, config) {
  const block = extractDivById(html, config.id);
  if (!block) {
    return {
      heading: config.fallbackHeading,
      text: '',
      html: '',
    };
  }

  const heading =
    decodeHtmlEntities(firstMatch(block, /<div class="chnlname">\s*<span>([\s\S]*?)<\/span>\s*<\/div>/i) ?? '').trim() ||
    config.fallbackHeading;
  const wrapper = extractFirstDivWithClass(block, 'chnlnamecon');
  const wrapperInnerHtml = wrapper ? getInnerHtml(wrapper) : '';
  const contentHtml = extractPrimaryContentHtml(wrapperInnerHtml) ?? wrapperInnerHtml;
  const normalizedHtml = contentHtml
    .trim()
    .replace(/>\s+</g, '><');

  return {
    heading,
    text: htmlToPlainText(normalizedHtml),
    html: normalizedHtml,
  };
}

function extractPrimaryContentHtml(html) {
  const trimmed = html.trim();
  if (!trimmed) {
    return '';
  }

  const firstDivIndex = trimmed.search(/<div\b/i);
  if (firstDivIndex === -1) {
    return trimmed;
  }

  const divHtml = extractBalancedDiv(trimmed, firstDivIndex);
  if (!divHtml) {
    return trimmed;
  }

  return getInnerHtml(divHtml).trim();
}

function extractFirstDivWithClass(html, className) {
  const escaped = escapeRegExp(className);
  const pattern = new RegExp(`<div[^>]*class="[^"]*\\b${escaped}\\b[^"]*"[^>]*>`, 'ig');
  const match = pattern.exec(html);
  if (!match || match.index === undefined) {
    return null;
  }

  return extractBalancedDiv(html, match.index);
}

function extractDivById(html, id) {
  const escaped = escapeRegExp(id);
  const pattern = new RegExp(`<div[^>]*id="${escaped}"[^>]*>`, 'i');
  const match = pattern.exec(html);
  if (!match || match.index === undefined) {
    return null;
  }

  return extractBalancedDiv(html, match.index);
}

function extractBalancedDiv(html, startIndex) {
  const tagPattern = /<\/?div\b[^>]*>/gi;
  tagPattern.lastIndex = startIndex;

  let depth = 0;
  let firstTagSeen = false;
  let endIndex = -1;
  let match;

  while ((match = tagPattern.exec(html)) !== null) {
    if (!firstTagSeen) {
      if (!match[0].startsWith('<div')) {
        return null;
      }
      firstTagSeen = true;
    }

    if (match[0][1] === '/') {
      depth -= 1;
      if (depth === 0) {
        endIndex = tagPattern.lastIndex;
        break;
      }
      continue;
    }

    depth += 1;
  }

  if (endIndex === -1) {
    return null;
  }

  return html.slice(startIndex, endIndex);
}

function getInnerHtml(elementHtml) {
  const openEnd = elementHtml.indexOf('>');
  const closeStart = elementHtml.lastIndexOf('</');
  if (openEnd === -1 || closeStart === -1 || closeStart <= openEnd) {
    return '';
  }

  return elementHtml.slice(openEnd + 1, closeStart);
}

function htmlToPlainText(html) {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/td>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\r/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}

function firstMatch(text, pattern) {
  const match = pattern.exec(text);
  return match?.[1] ?? null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&ensp;/gi, ' ')
    .replace(/&emsp;/gi, ' ')
    .replace(/&thinsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ldquo;/gi, '“')
    .replace(/&rdquo;/gi, '”')
    .replace(/&lsquo;/gi, '‘')
    .replace(/&rsquo;/gi, '’')
    .replace(/&middot;/gi, '·');
}

async function fetchText(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: {
      'user-agent': 'Mozilla/5.0 Codex scraper',
      accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return await response.text();
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let index = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (index < items.length) {
        const currentIndex = index;
        index += 1;
        results[currentIndex] = await worker(items[currentIndex], currentIndex);
      }
    }),
  );

  return results;
}

async function scrapeAllCountries() {
  const landingHtml = await fetchText(LANDING_URL);
  const regions = parseLandingPage(landingHtml);

  const regionResults = [];
  for (const region of regions) {
    const html = await fetchText(region.url);
    const parsed = parseRegionPage(html, region.url);
    regionResults.push({
      name: parsed.regionName || region.name,
      url: region.url,
      countries: parsed.countries,
    });
  }

  const countries = regionResults.flatMap((region) =>
    region.countries.map((country) => ({
      regionName: region.name,
      regionUrl: region.url,
      ...country,
    })),
  );

  const scrapedCountries = await mapWithConcurrency(countries, 6, async (country, index) => {
    console.log(`[${index + 1}/${countries.length}] ${country.regionName} ${country.name}`);
    const html = await fetchText(country.url);
    const sections = extractCountrySections(html);
    return {
      regionName: country.regionName,
      regionUrl: country.regionUrl,
      countryName: sections.countryName || country.name,
      countryUrl: country.url,
      entryResidence: sections.entryResidence,
      travelRiskSafety: sections.travelRiskSafety,
      safetyPrecautions: sections.safetyPrecautions,
    };
  });

  return {
    source: LANDING_URL,
    fetchedAt: new Date().toISOString(),
    regionCount: regionResults.length,
    countryCount: scrapedCountries.length,
    regions: regionResults.map((region) => ({
      name: region.name,
      url: region.url,
      countryCount: region.countries.length,
    })),
    countries: scrapedCountries,
  };
}

async function main() {
  const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUTPUT_PATH;
  const dataset = await scrapeAllCountries();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${dataset.countryCount} countries to ${outputPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
