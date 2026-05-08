import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { listItems } from '@/db/schema';
import { eq, and, or, like } from 'drizzle-orm';

function verifyAdminToken(req: NextRequest): NextResponse | null {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const [, timestamp] = decoded.split(':');
    if (!timestamp || Date.now() - parseInt(timestamp) > 7 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: 'Authorization error' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Authorization error' }, { status: 401 });
  }
  return null;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export async function POST(req: NextRequest) {
  const authError = verifyAdminToken(req);
  if (authError) return authError;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string;
    const listId = formData.get('list_id') as string;

    if (!file || !type || !listId) {
      return NextResponse.json({ error: '缺少参数' }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV无数据行' }, { status: 400 });
    }

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const title = cols[0];
      if (!title) { skipped++; continue; }

      // Find existing item by title within this list
      const existing = await db
        .select({ id: listItems.id, title: listItems.title })
        .from(listItems)
        .where(and(eq(listItems.listId, parseInt(listId)), like(listItems.title, `%${title}%`)))
        .limit(1);

      if (!existing[0]) { skipped++; continue; }

      try {
        const updateData: any = {};

        switch (type) {
          case 'address':
            if (cols[1]) updateData.address = cols[1];
            break;
          case 'intro':
            if (cols[1]) updateData.intro = cols[1];
            break;
          case 'image_url':
            if (cols[1]) updateData.imageUrl = cols[1];
            break;
          case 'transport':
            if (cols[1]) updateData.transportPlane = cols[1] || null;
            if (cols[2]) updateData.transportTrain = cols[2] || null;
            if (cols[3]) updateData.transportBus = cols[3] || null;
            break;
          case 'rating':
            if (cols[1]) updateData.ratingType = cols[1];
            if (cols[2]) updateData.customRating = cols[2] || null;
            break;
          default:
            return NextResponse.json({ error: '未知导入类型' }, { status: 400 });
        }

        if (Object.keys(updateData).length > 0) {
          await db.update(listItems).set(updateData).where(eq(listItems.id, existing[0].id));
          updated++;
        } else {
          skipped++;
        }
      } catch (e: any) {
        errors.push(`${title}: ${e.message}`);
      }
    }

    return NextResponse.json({ success: true, updated, skipped, errors });
  } catch (e: any) {
    return NextResponse.json({ error: '导入失败: ' + e.message }, { status: 500 });
  }
}
