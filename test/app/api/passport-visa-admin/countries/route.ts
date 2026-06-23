import { NextResponse } from 'next/server';

import { createDefaultPassportVisaAdminFileRepository } from '../../../../lib/passportVisaAdminRepository';
import { validatePassportVisaCountryRecord } from '../../../../lib/passportVisaAdminValidation';
import type { PassportVisaCountryRecord } from '../../../../lib/passportVisaAdminTypes';

export async function GET() {
  const repository = createDefaultPassportVisaAdminFileRepository();
  return NextResponse.json(await repository.listCountries());
}

export async function POST(request: Request) {
  const repository = createDefaultPassportVisaAdminFileRepository();
  const record = await request.json() as PassportVisaCountryRecord;
  validatePassportVisaCountryRecord(record);

  const countries = await repository.listCountries();
  if (countries.some((item) => item.mapCountryCode === record.mapCountryCode)) {
    return NextResponse.json({ error: 'country already exists' }, { status: 409 });
  }

  await repository.saveCountries([...countries, record]);
  return NextResponse.json(record, { status: 201 });
}
