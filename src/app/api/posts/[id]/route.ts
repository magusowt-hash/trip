import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  const post = {
    id,
    title: '京都樱花季',
    content: '春天的京都真是太美了，樱花盛开满城',
    topic: '城市漫游',
    author: '旅行达人',
    avatar: 'https://i.pravatar.cc/48?u=travel-1',
    images: [
      { id: '1', url: 'https://picsum.photos/seed/kyoto1/800/600', caption: '清水寺' },
      { id: '2', url: 'https://picsum.photos/seed/kyoto2/800/600', caption: '祇园' },
    ],
    commentsCnt: 12,
    favoritesCnt: 36,
    createdAt: '2026-04-10T10:00:00Z',
  };

  return NextResponse.json(post);
}
