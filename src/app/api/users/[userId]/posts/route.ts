import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get('cursor');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

  // Mock: return user's posts (public only for other users)
  const posts = [
    {
      id: '1',
      title: '我的旅行',
      topic: '推荐',
      author: '用户',
      avatar: 'https://i.pravatar.cc/48?u=user',
      coverImageUrl: 'https://picsum.photos/seed/user1/400/300',
      gallery: ['https://picsum.photos/seed/user1/800/600'],
      commentsCnt: 0,
      favoritesCnt: 0,
      createdAt: '2026-04-10T10:00:00Z',
      cursor: '2026-04-10T10:00:00Z_1',
    },
  ];

  return NextResponse.json({
    posts,
    nextCursor: null,
    hasMore: false,
  });
}
