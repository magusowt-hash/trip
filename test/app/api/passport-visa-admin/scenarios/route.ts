import { NextResponse } from 'next/server';

import { createDefaultPassportVisaAdminFileRepository } from '../../../../lib/passportVisaAdminRepository';
import { validatePassportVisaScenarioRecord } from '../../../../lib/passportVisaAdminValidation';
import type { PassportVisaScenarioRecord } from '../../../../lib/passportVisaAdminTypes';

export async function GET() {
  const repository = createDefaultPassportVisaAdminFileRepository();
  return NextResponse.json(await repository.listScenarios());
}

export async function POST(request: Request) {
  const repository = createDefaultPassportVisaAdminFileRepository();
  const record = await request.json() as PassportVisaScenarioRecord;
  validatePassportVisaScenarioRecord(record);

  const scenarios = await repository.listScenarios();
  if (scenarios.some((item) => item.id === record.id)) {
    return NextResponse.json({ error: 'scenario already exists' }, { status: 409 });
  }

  await repository.saveScenarios([...scenarios, record]);
  return NextResponse.json(record, { status: 201 });
}
