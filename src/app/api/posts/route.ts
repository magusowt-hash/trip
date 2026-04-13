import { NextRequest, NextResponse } from 'next/server';
import type { FeedPostDTO, DetailPostDTO, CreatePostPayload } from '@/types/post';
import { verifyAuthToken } from '@/server/auth/jwt';
import { getAuthTokenFromRequest } from '@/server/auth/cookies';
import { getGlobalPosts } from '@/lib/shared-data';
import type { UploadedFile } from '@/lib/shared-data';
import { db } from '@/db';
import { users, posts, postImages, uploadedFiles } from '@/db/schema';
import { eq, desc, inArray, and, or, sql, lt, SQL } from 'drizzle-orm';

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
  try {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
    const topic = searchParams.get('topic');

    // Build where conditions
    const conditions: SQL[] = [eq(posts.privacy, 'public')];
    
    if (topic && topic !== '推荐') {
      conditions.push(eq(posts.topic, topic));
    }

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
    
    // Get user info for all unique user IDs
    const userIds = [...new Set(sliced.map((p) => p.userId))];
    const userInfos = new Map<number, { nickname: string; avatar: string }>();
    
    for (const uid of userIds) {
      const info = await getUserInfo(uid);
      userInfos.set(uid, info);
    }
    
    // Get images for all posts in a single query
    const postIds = sliced.map((p) => p.id);
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

    const feedPosts: FeedPostDTO[] = sliced.map((p) => {
      const postImages = imagesMap.get(p.id) || [];
      const userInfo = userInfos.get(p.userId) || { nickname: '旅行者', avatar: '' };
      return {
        id: String(p.id),
        title: p.title,
        topic: p.topic || '推荐',
        author: userInfo.nickname,
        avatar: userInfo.avatar,
        coverImageUrl: p.coverImageUrl || '',
        gallery: postImages.map((i) => i.url),
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
    console.error('GET /api/posts error:', error);
    return NextResponse.json({ error: '获取帖子失败', message: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('POST /api/posts called');
    let userId = await getCurrentUserId(request);
    // Debug header for testing
    const debugUserId = request.headers.get('x-debug-user-id');
    if (debugUserId) {
      userId = parseInt(debugUserId, 10);
      console.log('Using debug user ID:', userId);
    }
    console.log('User ID:', userId);
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

    // Query uploaded files from database
    let userUploadedFiles: UploadedFile[] = [];
    if (imageIds && imageIds.length > 0) {
      const dbFiles = await db.select({
        id: uploadedFiles.id,
        url: uploadedFiles.url,
        thumbnailUrl: uploadedFiles.thumbnailUrl,
      })
      .from(uploadedFiles)
      .where(and(
        eq(uploadedFiles.userId, userId),
        inArray(uploadedFiles.id, imageIds)
      ));
      userUploadedFiles = dbFiles.map(f => ({ id: f.id, url: f.url, thumbnailUrl: f.thumbnailUrl || f.url }));
      console.log('Found uploaded files in DB:', userUploadedFiles.length);
    }
    
    // Keep backward compatibility with global uploads
    const { uploaded } = getGlobalPosts();
    const globalUploadedFiles = imageIds
      ?.map((imgId) => uploaded.find((u) => u.id === imgId))
      .filter((u): u is UploadedFile => u !== undefined) || [];
    
    // Prefer database files, fallback to global (should be same)
    if (userUploadedFiles.length === 0 && globalUploadedFiles.length > 0) {
      userUploadedFiles = globalUploadedFiles;
    }

    const coverImageUrl = userUploadedFiles.length > 0 ? userUploadedFiles[0].url : null;
    
    // Insert post into database using transaction
    const postId = await db.transaction(async (tx) => {
      // Insert post
      await tx.insert(posts).values({
        userId,
        title,
        content: content || '',
        coverImageUrl,
        privacy: privacy || 'public',
        topic: topic || '推荐',
        // status has default 'published'
        // commentsCnt, favoritesCnt have default 0
        // createdAt, updatedAt have defaultNow()
      });
      
      // Get the last inserted ID
      const lastIdResult = await tx.execute(sql`SELECT LAST_INSERT_ID() AS id`);
      // For MySQL2, result is [rows, fields] for SELECT queries
      const rows = (lastIdResult as unknown as [{ id: number }[]])[0];
      const insertedPostId = rows[0]?.id;
      
      if (!insertedPostId) {
        throw new Error('Failed to retrieve inserted post ID');
      }
      
      // Insert post images if any
      if (userUploadedFiles.length > 0) {
        const imageValues = userUploadedFiles.map((file, idx) => ({
          postId: insertedPostId,
          url: file.url,
          thumbnailUrl: file.thumbnailUrl || file.url,
          caption: '',
          sortOrder: idx,
        }));
        await tx.insert(postImages).values(imageValues);
      }
      
      return insertedPostId;
    });

    const userInfo = await getUserInfo(userId);

    const detailPost: DetailPostDTO = {
      id: String(postId),
      title,
      content: content || '',
      topic: topic || '推荐',
      author: userInfo.nickname,
      avatar: userInfo.avatar,
      images: userUploadedFiles.map((file, idx) => ({
        id: String(idx + 1),
        url: file.url,
        thumbnailUrl: file.thumbnailUrl || file.url,
        caption: '',
      })),
      commentsCnt: 0,
      favoritesCnt: 0,
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json(detailPost, { status: 201 });
  } catch (error) {
    console.error('POST /api/posts error:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : typeof error
    });
    return NextResponse.json({ 
      error: '服务器错误', 
      message: error instanceof Error ? error.message : String(error),
      details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
    }, { status: 500 });
  }
}