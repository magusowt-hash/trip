import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { listItems } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const listId = formData.get('list_id') as string;

    if (!file || !listId) {
      return NextResponse.json({ error: '缺少文件或榜单ID' }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      return NextResponse.json({ error: '文件为空或格式错误' }, { status: 400 });
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const titleIdx = headers.findIndex(h => h === '标题' || h === 'title');
    const descIdx = headers.findIndex(h => h === '描述' || h === 'description');
    const coordIdx = headers.findIndex(h => h === '坐标' || h === 'coord' || h === 'location');
    const addrIdx = headers.findIndex(h => h === '地址' || h === 'address');

    if (titleIdx === -1) {
      return NextResponse.json({ error: '必须包含title列' }, { status: 400 });
    }

    const lastItem = await db
      .select({ orderNum: listItems.orderNum })
      .from(listItems)
      .where(eq(listItems.listId, parseInt(listId)))
      .orderBy(desc(listItems.orderNum))
      .limit(1);
    let orderNum = (lastItem[0]?.orderNum || 0) + 1;

    const results = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (!values[titleIdx]) continue;

      let lng = null, lat = null;
      if (coordIdx !== -1 && values[coordIdx]) {
        const parts = values[coordIdx].split(',');
        lng = parts[0]?.trim() || null;
        lat = parts[1]?.trim() || null;
      }

      const result = await db.insert(listItems).values({
        listId: parseInt(listId),
        title: values[titleIdx] || '',
        description: descIdx !== -1 ? values[descIdx] || null : null,
        lng: lng,
        lat: lat,
        address: addrIdx !== -1 ? values[addrIdx] || null : null,
        orderNum: orderNum++,
        status: 1,
      });
      results.push(result[0].insertId);
    }

    return NextResponse.json({ success: true, count: results.length, ids: results });
  } catch (error: any) {
    console.error('CSV import error:', error);
    return NextResponse.json({ error: '导入失败: ' + error?.message }, { status: 500 });
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  
  while (result.length < 5) {
    result.push('');
  }
  
  return result;
}