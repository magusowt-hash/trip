import { NextResponse } from 'next/server';

import { createDefaultPassportVisaAdminFileRepository } from '../../../../lib/passportVisaAdminRepository';
import type { PassportVisaBootstrapPayload } from '../../../../lib/passportVisaAdminTypes';

export async function GET() {
  const repository = createDefaultPassportVisaAdminFileRepository();
  const [countries, scenarios, theme] = await Promise.all([
    repository.listCountries(),
    repository.listScenarios(),
    repository.getTheme(),
  ]);

  const payload: PassportVisaBootstrapPayload = {
    countries,
    scenarios,
    theme,
  };

  return NextResponse.json(payload);
}
