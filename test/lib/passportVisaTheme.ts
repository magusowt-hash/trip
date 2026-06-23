import fs from 'node:fs';

import type { PassportVisaThemeRecord, PassportVisaThemeSchemeRecord } from './passportVisaAdminTypes';

const themeDataUrl = new URL('../data/passport-visa/theme.json', import.meta.url);

const themeScheme = JSON.parse(
  fs.readFileSync(themeDataUrl, 'utf8'),
) as PassportVisaThemeSchemeRecord;

export const passportVisaTheme = themeScheme.themes.find(
  (theme) => theme.id === themeScheme.activeThemeId,
) as PassportVisaThemeRecord;
