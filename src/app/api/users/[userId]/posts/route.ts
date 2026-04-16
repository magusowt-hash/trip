import { NextRequest, NextResponse } from 'next/server';
import type { FeedPostDTO } from '@/types/post';
import { getGlobalPosts } from '@/lib/shared-data';
import { db } from '@/db';
import { users, posts, postImages } from '@/db/schema';
import { eq, desc, inArray, and, or, lt, SQL } from 'drizzle-orm';

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
    const numericUserId = Number(userId);

    const userInfo = await getUserInfo(numericUserId);

    // Build where conditions
    const conditions: SQL[] = [
      eq(posts.userId, numericUserId),
      eq(posts.privacy, 'public')
    ];

    // Apply cursor pagination
    if (cursor) {
      const [cursorCreatedAt, cursorId] = cursor.split('_');
      const cursorDate = new Date(cursorCreatedAt);
      const cursorNumId = parseInt(cursorId);
      const cursorCondition = or(
        lt(posts.createdAt, cursorDate),
        and(
          eq(posts.createdAt, cursorDate),
          lt(posts.id, cursorNumId)
        )
      );
      if (cursorCondition) {
        conditions.push(cursorCondition);
      }
    }

    // Build and execute query
    const dbPosts = await db.select({
      id: posts.id,
      userId: posts.userId,
      title: posts.title,
      content: posts.content,
      coverImageUrl: posts.coverImageUrl,
      privacy: posts.privacy,
      topic: posts.topic,
      commentsCnt: posts.commentsCnt,
      favoritesCnt: posts.favoritesCnt,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(and(...conditions))
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1); // Fetch one extra to check hasMore
    
    const hasMore = dbPosts.length > limit;
    const sliced = hasMore ? dbPosts.slice(0, limit) : dbPosts;
    
    // Get images for all posts in a single query
    const postIds = sliced.map((p: { id: number }) => p.id);
    const imagesMap = new Map<number, any[]>();
    if (postIds.length > 0) {
      const allImages = await db.select({
        id: postImages.id,
        postId: postImages.postId,
        url: postImages.url,
        thumbnailUrl: postImages.thumbnailUrl,
        caption: postImages.caption,
        sortOrder: postImages.sortOrder,
      })
      .from(postImages)
      .where(inArray(postImages.postId, postIds))
      .orderBy(postImages.sortOrder);
      
      // Group images by postId
      for (const img of allImages) {
        if (!imagesMap.has(img.postId)) {
          imagesMap.set(img.postId, []);
        }
        imagesMap.get(img.postId)!.push(img);
      }
    }

    const feedPosts: FeedPostDTO[] = sliced.map((p: typeof dbPosts[0]) => {
      const postImages = imagesMap.get(p.id) || [];
      return {
        id: String(p.id),
        title: p.title,
        topic: p.topic || '推荐',
        author: userInfo.nickname,
        avatar: userInfo.avatar,
        coverImageUrl: p.coverImageUrl || '',
        gallery: postImages.map((i: { url: string }) => i.url),
        imagesCount: postImages.length,
        commentsCnt: p.commentsCnt || 0,
        favoritesCnt: p.favoritesCnt || 0,
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