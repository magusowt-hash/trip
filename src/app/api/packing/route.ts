import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { packingCategories, packingTemplates } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const categories = await db
      .select()
      .from(packingCategories)
      .where(eq(packingCategories.status, 1))
      .orderBy(asc(packingCategories.orderNum));

    const allTemplates = await db
      .select()
      .from(packingTemplates)
      .where(eq(packingTemplates.status, 1))
      .orderBy(asc(packingTemplates.orderNum));

    return NextResponse.json({
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        templates: allTemplates
          .filter((t) => t.categoryId === c.id)
          .map((t) => t.name),
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}
