import { NextRequest, NextResponse } from 'next/server';

const MOCK_UPLOADS: { id: string; url: string }[] = [];

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // In production: upload to cloud storage (S3, etc.)
  // For now: generate mock URL
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const url = `https://picsum.photos/seed/${id}/800/600`;
  
  MOCK_UPLOADS.push({ id, url });
  
  return NextResponse.json({ id, url }, { status: 201 });
}
