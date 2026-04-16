import { NextRequest, NextResponse } from 'next/server';
import type { FeedPostDTO } from '@/types/post';
import { getGlobalPosts } from '@/lib/shared-data';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

async function getUserInfo(userId: number) {
  const result = await db.select({ nickname: users.nickname, avatar: users.avatar }).from(users).where(eq(users.id, userId)).limit(1);
  if (result.length === 0) return { nickname: '旅行者', avatar: '' };
  return { nickname: result[0].nickname || '旅行者', avatar: result[0].avatar || '' };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

    const { posts, images } = getGlobalPosts();
    const numericUserId = Number(userId);

    const userInfo = await getUserInfo(numericUserId);

    const userPosts = posts
      .filter((p) => p.userId === numericUserId && p.privacy === 'public')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    let filtered = userPosts;
    if (cursor) {
      const [cursorCreatedAt, cursorId] = cursor.split('_');
      const cursorDate = new Date(cursorCreatedAt);
      const cursorNumId = parseInt(cursorId);
      filtered = userPosts.filter(
        (p) => p.createdAt < cursorDate || (p.createdAt.getTime() === cursorDate.getTime() && p.id < cursorNumId)
      );
    }

    const sliced = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;

    const feedPosts: FeedPostDTO[] = sliced.map((p) => {
      const postImages = images.filter((i) => i.postId === p.id).sort((a, b) => a.sortOrder - b.sortOrder);
      return {
        id: String(p.id),
        title: p.title,
        topic: p.topic,
        author: userInfo.nickname,
        avatar: userInfo.avatar,
        coverImageUrl: p.coverImageUrl || '',
        gallery: postImages.map((i) => i.url),
        imagesCount: p.imagesCount,
        commentsCnt: p.commentsCnt,
        favoritesCnt: p.favoritesCnt,
        createdAt: p.createdAt.toISOString(),
        cursor: `${p.createdAt.toISOString()}_${p.id}`,
      };
    });

    const nextCursor = hasMore ? `${sliced[sliced.length - 1].createdAt.toISOString()}_${sliced[sliced.length - 1].id}` : null;

    return NextResponse.json({ posts: feedPosts, nextCursor, hasMore });
  } catch (error) {
    console.error('GET /api/users/[userId]/posts error:', error);
    return NextResponse.json({ error: '获取用户帖子失败', message: String(error) }, { status: 500 });
  }
}