import { NextRequest, NextResponse } from 'next/server';
import type { DetailPostDTO } from '@/types/post';
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { posts, images } = getGlobalPosts();
    const post = posts.find((p) => p.id === Number(id));

    if (!post) {
      return NextResponse.json({ error: '帖子不存在' }, { status: 404 });
    }

    const userInfo = await getUserInfo(post.userId);
    const postImages = images.filter((i) => i.postId === post.id).sort((a, b) => a.sortOrder - b.sortOrder);

    const detailPost: DetailPostDTO = {
      id: String(post.id),
      title: post.title,
      content: post.content,
      topic: post.topic,
      author: userInfo.nickname,
      avatar: userInfo.avatar,
      images: postImages.map((i) => ({
        id: String(i.id),
        url: i.url,
        thumbnailUrl: i.thumbnailUrl || i.url,
        caption: i.caption || '',
      })),
      commentsCnt: post.commentsCnt,
      favoritesCnt: post.favoritesCnt,
      createdAt: post.createdAt.toISOString(),
    };

    return NextResponse.json(detailPost);
  } catch (error) {
    console.error('GET /api/posts/[id] error:', error);
    return NextResponse.json({ error: '获取帖子失败', message: String(error) }, { status: 500 });
  }
}