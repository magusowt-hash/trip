import { NextResponse } from 'next/server';

import { createDefaultPassportVisaAdminFileRepository } from '../../../../lib/passportVisaAdminRepository';
import {
  validatePassportVisaThemeRecord,
  validatePassportVisaThemeSchemeRecord,
} from '../../../../lib/passportVisaAdminValidation';
import type {
  PassportVisaThemeRecord,
  PassportVisaThemeSchemeRecord,
} from '../../../../lib/passportVisaAdminTypes';

export async function GET() {
  const repository = createDefaultPassportVisaAdminFileRepository();
  return NextResponse.json(await repository.getThemeScheme());
}

export async function PUT(request: Request) {
  const repository = createDefaultPassportVisaAdminFileRepository();
  const record = await request.json() as PassportVisaThemeRecord;
  validatePassportVisaThemeRecord(record);
  await repository.saveTheme(record);
  return NextResponse.json(record);
}

export async function POST(request: Request) {
  const repository = createDefaultPassportVisaAdminFileRepository();
  const record = await request.json() as PassportVisaThemeSchemeRecord;
  validatePassportVisaThemeSchemeRecord(record);
  await repository.saveThemeScheme(record);
  return NextResponse.json(record);
}
