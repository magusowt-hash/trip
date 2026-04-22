import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { markers as markersTable } from '@/db/schema';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: '请上传文件' }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

    let imported = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(',').map(v => v.trim());
        const row: any = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx] || '';
        });

        if (!row.name) {
          failed++;
          errors.push(`第${i + 1}行: 缺少名称`);
          continue;
        }

        await db.insert(markersTable).values({
          name: row.name,
          lng: row.lng || null,
          lat: row.lat || null,
          address: row.address || null,
          description: row.description || null,
          type: row.type || 'other',
          status: 1,
        });
        imported++;
      } catch (e: any) {
        failed++;
        errors.push(`第${i + 1}行: ${e.message}`);
      }
    }

    return NextResponse.json({ success: true, imported, failed, errors: errors.slice(0, 10) });
  } catch (error: any) {
    console.error('Import error:', error);
    return NextResponse.json({ error: '导入失败: ' + error?.message }, { status: 500 });
  }
}