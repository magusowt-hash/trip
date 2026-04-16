import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { plans } from '@/db/schema';

export async function GET(req: NextRequest) {
  try {
    const userPlans = await db.select({
      id: plans.id,
      name: plans.name,
      startDate: plans.startDate,
      endDate: plans.endDate,
      createdAt: plans.createdAt,
      updatedAt: plans.updatedAt,
    }).from(plans).orderBy(desc(plans.updatedAt));
    return NextResponse.json({ plans: userPlans }, { status: 200 });
  } catch (error) {
    console.error('GET /api/plans error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, items = [], activeTab = 0, startDate, endDate } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Insert plan
    const result = await db.execute(
      `INSERT INTO plans (user_id, name, active_tab, start_date, end_date, created_at, updated_at) VALUES (1, '${name}', ${activeTab}, ${startDate ? `'${startDate}'` : 'NULL'}, ${endDate ? `'${endDate}'` : 'NULL'}, NOW(), NOW())`
    );

    // Get the inserted plan id
    const insertedPlan = await db.execute('SELECT LAST_INSERT_ID() as id') as any;
    const planId = insertedPlan[0]?.id;

    // Insert transport items
    if (planId && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.from || item.to || item.note) {
          await db.execute(
            `INSERT INTO transport_items (plan_id, \`from\`, \`to\`, note, note_expanded, sort_order, created_at, updated_at) 
             VALUES (${planId}, '${item.from || ''}', '${item.to || ''}', '${item.note || ''}', ${item.noteExpanded ? 1 : 0}, ${i}, NOW(), NOW())`
          );
        }
      }
    }

    return NextResponse.json({ success: true, message: 'Plan saved', planId }, { status: 201 });
  } catch (error) {
    console.error('POST /api/plans error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, items = [], activeTab = 0, startDate, endDate } = body;

    if (!id || !name) {
      return NextResponse.json({ error: 'ID and name are required' }, { status: 400 });
    }

    // Update plan
    await db.execute(
      `UPDATE plans SET name = '${name}', active_tab = ${activeTab}, start_date = ${startDate ? `'${startDate}'` : 'NULL'}, end_date = ${endDate ? `'${endDate}'` : 'NULL'}, updated_at = NOW() WHERE id = ${id}`
    );

    // Delete existing transport items
    await db.execute(`DELETE FROM transport_items WHERE plan_id = ${id}`);

    // Re-insert transport items
    if (items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.from || item.to || item.note) {
          await db.execute(
            `INSERT INTO transport_items (plan_id, \`from\`, \`to\`, note, note_expanded, sort_order, created_at, updated_at) 
             VALUES (${id}, '${item.from || ''}', '${item.to || ''}', '${item.note || ''}', ${item.noteExpanded ? 1 : 0}, ${i}, NOW(), NOW())`
          );
        }
      }
    }

    return NextResponse.json({ success: true, message: 'Plan updated' }, { status: 200 });
  } catch (error) {
    console.error('PUT /api/plans error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}