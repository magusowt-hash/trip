import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { plans, transportItems } from '@/db/schema';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const planId = parseInt(params.id);

    const [plan] = await db
      .select({
        id: plans.id,
        name: plans.name,
        activeTab: plans.activeTab,
        startDate: plans.startDate,
        endDate: plans.endDate,
        createdAt: plans.createdAt,
        updatedAt: plans.updatedAt,
      })
      .from(plans)
      .where(eq(plans.id, planId))
      .limit(1);

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const items = await db
      .select({
        id: transportItems.id,
        planId: transportItems.planId,
        from: transportItems.from,
        to: transportItems.to,
        note: transportItems.note,
        noteExpanded: transportItems.noteExpanded,
        sortOrder: transportItems.sortOrder,
        startDate: transportItems.startDate,
        endDate: transportItems.endDate,
        createdAt: transportItems.createdAt,
      })
      .from(transportItems)
      .where(eq(transportItems.planId, planId))
      .orderBy(transportItems.sortOrder);

    return NextResponse.json({ plan, items }, { status: 200 });
  } catch (error) {
    console.error('GET /api/plans/[id] error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
