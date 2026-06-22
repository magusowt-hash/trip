import { NextResponse } from 'next/server';

import { createDefaultPassportVisaAdminFileRepository } from '@/modules/maps/packages/china-passport-visa-map/lib/passportVisaAdminRepository';
import { validatePassportVisaCountryRecord } from '@/modules/maps/packages/china-passport-visa-map/lib/passportVisaAdminValidation';
import type { PassportVisaCountryRecord } from '@/modules/maps/packages/china-passport-visa-map/lib/passportVisaAdminTypes';

type RouteContext = {
  params: Promise<{
    code: string;
  }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const repository = createDefaultPassportVisaAdminFileRepository();
  const { code } = await context.params;
  const record = await request.json() as PassportVisaCountryRecord;

  validatePassportVisaCountryRecord(record);

  const countries = await repository.listCountries();
  const index = countries.findIndex((item) => item.mapCountryCode === code);
  if (index < 0) {
    return NextResponse.json({ error: 'country not found' }, { status: 404 });
  }

  countries[index] = record;
  await repository.saveCountries(countries);
  return NextResponse.json(record);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const repository = createDefaultPassportVisaAdminFileRepository();
  const { code } = await context.params;
  const countries = await repository.listCountries();
  const nextCountries = countries.filter((item) => item.mapCountryCode !== code);

  if (nextCountries.length === countries.length) {
    return NextResponse.json({ error: 'country not found' }, { status: 404 });
  }

  await repository.saveCountries(nextCountries);
  return NextResponse.json({ ok: true });
}
