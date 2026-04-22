import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { listItems } from '@/db/schema';

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
    const titleIdx = headers.indexOf('title');
    const descIdx = headers.indexOf('description');
    const coverIdx = headers.indexOf('cover_image');
    const lngIdx = headers.indexOf('lng');
    const latIdx = headers.indexOf('lat');
    const addrIdx = headers.indexOf('address');
    const orderIdx = headers.indexOf('order_num');

    if (titleIdx === -1) {
      return NextResponse.json({ error: '必须包含title列' }, { status: 400 });
    }

    const results = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (!values[titleIdx]) continue;

      const result = await db.insert(listItems).values({
        listId: parseInt(listId),
        title: values[titleIdx] || '',
        description: descIdx !== -1 ? values[descIdx] || null : null,
        coverImage: coverIdx !== -1 ? values[coverIdx] || null : null,
        lng: lngIdx !== -1 ? values[lngIdx] || null : null,
        lat: latIdx !== -1 ? values[latIdx] || null : null,
        address: addrIdx !== -1 ? values[addrIdx] || null : null,
        orderNum: orderIdx !== -1 ? parseInt(values[orderIdx]) || 0 : 0,
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
  
  while (result.length < 10) {
    result.push('');
  }
  
  return result;
}