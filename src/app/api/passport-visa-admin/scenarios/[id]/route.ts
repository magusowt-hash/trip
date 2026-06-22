import { NextResponse } from 'next/server';

import { createDefaultPassportVisaAdminFileRepository } from '@/modules/maps/packages/china-passport-visa-map/lib/passportVisaAdminRepository';
import { validatePassportVisaScenarioRecord } from '@/modules/maps/packages/china-passport-visa-map/lib/passportVisaAdminValidation';
import type { PassportVisaScenarioRecord } from '@/modules/maps/packages/china-passport-visa-map/lib/passportVisaAdminTypes';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const repository = createDefaultPassportVisaAdminFileRepository();
  const { id } = await context.params;
  const record = await request.json() as PassportVisaScenarioRecord;

  validatePassportVisaScenarioRecord(record);

  const scenarios = await repository.listScenarios();
  const index = scenarios.findIndex((item) => item.id === id);
  if (index < 0) {
    return NextResponse.json({ error: 'scenario not found' }, { status: 404 });
  }

  scenarios[index] = record;
  await repository.saveScenarios(scenarios);
  return NextResponse.json(record);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const repository = createDefaultPassportVisaAdminFileRepository();
  const { id } = await context.params;
  const scenarios = await repository.listScenarios();
  const nextScenarios = scenarios.filter((item) => item.id !== id);

  if (nextScenarios.length === scenarios.length) {
    return NextResponse.json({ error: 'scenario not found' }, { status: 404 });
  }

  await repository.saveScenarios(nextScenarios);
  return NextResponse.json({ ok: true });
}
