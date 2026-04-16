import { NextRequest, NextResponse } from 'next/server';
import type { DetailPostDTO } from '@/types/post';
import { getGlobalPosts } from '@/lib/shared-data';
import { db } from '@/db';
import { users, posts, postImages } from '@/db/schema';
import { eq } from 'drizzle-orm';

async function getUserInfo(userId: number) {
  const result = await db.select({ nickname: users.nickname, avatar: users.avatar }).from(users).where(eq(users.id, userId)).limit(1);
  if (result.length === 0) return { nickname: '旅行者', avatar: '' };
  return { nickname: result[0].nickname || '旅行者', avatar: result[0].avatar || '' };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const postId = Number(id);
    
    // Fetch post from database
    const postResult = await db.select({
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
    }).from(posts).where(eq(posts.id, postId)).limit(1);
    
    if (postResult.length === 0) {
      return NextResponse.json({ error: '帖子不存在' }, { status: 404 });
    }
    
    const post = postResult[0];
    const userInfo = await getUserInfo(post.userId);
    
    // Fetch post images
    const postImagesResult = await db.select({
      id: postImages.id,
      postId: postImages.postId,
      url: postImages.url,
      thumbnailUrl: postImages.thumbnailUrl,
      caption: postImages.caption,
      sortOrder: postImages.sortOrder,
    }).from(postImages).where(eq(postImages.postId, postId)).orderBy(postImages.sortOrder);
    
    const detailPost: DetailPostDTO = {
      id: String(post.id),
      title: post.title,
      content: post.content || '',
      topic: post.topic || '推荐',
      author: userInfo.nickname,
      avatar: userInfo.avatar,
      images: postImagesResult.map((i) => ({
        id: String(i.id),
        url: i.url,
        thumbnailUrl: i.thumbnailUrl || i.url,
        caption: i.caption || '',
      })),
      commentsCnt: post.commentsCnt || 0,
      favoritesCnt: post.favoritesCnt || 0,
      createdAt: post.createdAt.toISOString(),
    };

    return NextResponse.json(detailPost);
  } catch (error) {
    console.error('GET /api/posts/[id] error:', error);
    return NextResponse.json({ error: '获取帖子失败', message: String(error) }, { status: 500 });
  }
}