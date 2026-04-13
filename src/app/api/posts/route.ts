import { NextRequest, NextResponse } from 'next/server';
import type { FeedPostDTO, DetailPostDTO, CreatePostPayload } from '@/types/post';
import { verifyAuthToken } from '@/server/auth/jwt';
import { getAuthTokenFromRequest } from '@/server/auth/cookies';
import { getGlobalPosts, PostRecord } from '@/lib/shared-data';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

async function getCurrentUserId(request: NextRequest): Promise<number | null> {
  const token = getAuthTokenFromRequest(request);
  if (!token) return null;
  try {
    const payload = await verifyAuthToken(token);
    return Number(payload.sub);
  } catch {
    return null;
  }
}

async function getUserInfo(userId: number) {
  const result = await db.select({ nickname: users.nickname, avatar: users.avatar }).from(users).where(eq(users.id, userId)).limit(1);
  if (result.length === 0) return { nickname: '旅行者', avatar: '' };
  return { nickname: result[0].nickname || '旅行者', avatar: result[0].avatar || '' };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get('cursor');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
  const topic = searchParams.get('topic');

  const { posts } = getGlobalPosts();
  let filtered = posts.filter((p) => p.privacy === 'public');

  if (topic && topic !== '推荐') {
    filtered = filtered.filter((p) => p.topic === topic);
  }

  if (cursor) {
    const [cursorCreatedAt, cursorId] = cursor.split('_');
    const cursorDate = new Date(cursorCreatedAt);
    const cursorNumId = parseInt(cursorId);
    filtered = filtered.filter(
      (p) => p.createdAt < cursorDate || (p.createdAt.getTime() === cursorDate.getTime() && p.id < cursorNumId)
    );
  }

  filtered.sort((a, b) => {
    if (a.createdAt !== b.createdAt) return b.createdAt.getTime() - a.createdAt.getTime();
    return b.id - a.id;
  });

  const sliced = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;

  const { images } = getGlobalPosts();
  
  const userIds = [...new Set(sliced.map((p) => p.userId))];
  const userInfos = new Map<number, { nickname: string; avatar: string }>();
  
  for (const uid of userIds) {
    const info = await getUserInfo(uid);
    userInfos.set(uid, info);
  }

  const feedPosts: FeedPostDTO[] = sliced.map((p) => {
    const postImages = images.filter((i) => i.postId === p.id).sort((a, b) => a.sortOrder - b.sortOrder);
    const userInfo = userInfos.get(p.userId) || { nickname: '旅行者', avatar: '' };
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
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId(request);
    if (!userId) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    let body: CreatePostPayload;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: '无效的请求体' }, { status: 400 });
    }

    const { title, content, privacy, topic, imageIds } = body;
    
    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: '标题不能为空' }, { status: 400 });
    }

    const { posts, images, uploaded } = getGlobalPosts();
    const id = posts.length > 0 ? Math.max(...posts.map((p) => p.id)) + 1 : 1;

    const userUploadedFiles = imageIds
      ?.map((imgId) => uploaded.find((u) => u.id === imgId))
      .filter((u) => !!u) || [];

    const newPost: PostRecord = {
      id,
      userId,
      title,
      content: content || '',
      coverImageUrl: userUploadedFiles.length > 0 ? userUploadedFiles[0].thumbnailUrl : null,
      imagesCount: userUploadedFiles.length,
      privacy: privacy || 'public',
      topic: topic || '推荐',
      commentsCnt: 0,
      favoritesCnt: 0,
      createdAt: new Date(),
    };

    posts.push(newPost);

    const userInfo = await getUserInfo(userId);

    userUploadedFiles.forEach((file, idx) => {
      images.push({
        id: images.length + 1,
        postId: id,
        url: file!.url,
        thumbnailUrl: file!.thumbnailUrl || file!.url,
        caption: '',
        sortOrder: idx,
      });
    });

    const detailPost: DetailPostDTO = {
      id: String(newPost.id),
      title: newPost.title,
      content: newPost.content,
      topic: newPost.topic,
      author: userInfo.nickname,
      avatar: userInfo.avatar,
      images: userUploadedFiles.map((file, idx) => ({
        id: String(idx + 1),
        url: file!.url,
        thumbnailUrl: file!.thumbnailUrl || file!.url,
        caption: '',
      })),
      commentsCnt: 0,
      favoritesCnt: 0,
      createdAt: newPost.createdAt.toISOString(),
    };

    return NextResponse.json(detailPost, { status: 201 });
  } catch (error) {
    console.error('POST /api/posts error:', error);
    return NextResponse.json({ error: '服务器错误', message: String(error) }, { status: 500 });
  }
}