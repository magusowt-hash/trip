import { NextRequest, NextResponse } from 'next/server';
import type { FeedPostDTO, FeedResponse, DetailPostDTO, DetailImageDTO, CreatePostPayload } from '@/types/post';

interface PostRecord {
  id: number;
  userId: number;
  title: string;
  content: string;
  coverImageUrl: string | null;
  privacy: 'public' | 'private';
  topic: string;
  commentsCnt: number;
  favoritesCnt: number;
  createdAt: Date;
}

interface ImageRecord {
  id: number;
  postId: number;
  url: string;
  caption: string | null;
  sortOrder: number;
}

const MOCK_POSTS: PostRecord[] = [
  {
    id: 1,
    userId: 1,
    title: '京都樱花季',
    content: '春天的京都真是太美了，樱花盛开满城',
    coverImageUrl: 'https://picsum.photos/seed/kyoto/400/300',
    privacy: 'public',
    topic: '城市漫游',
    commentsCnt: 12,
    favoritesCnt: 36,
    createdAt: new Date('2026-04-10T10:00:00Z'),
  },
  {
    id: 2,
    userId: 2,
    title: '三亚冲浪日记',
    content: '第一次尝试冲浪，超级刺激！',
    coverImageUrl: 'https://picsum.photos/seed/sanya/400/300',
    privacy: 'public',
    topic: '海边假期',
    commentsCnt: 8,
    favoritesCnt: 24,
    createdAt: new Date('2026-04-09T14:00:00Z'),
  },
];

const MOCK_IMAGES: ImageRecord[] = [
  { id: 1, postId: 1, url: 'https://picsum.photos/seed/kyoto1/800/600', caption: '清水寺', sortOrder: 0 },
  { id: 2, postId: 1, url: 'https://picsum.photos/seed/kyoto2/800/600', caption: '祇园', sortOrder: 1 },
  { id: 3, postId: 2, url: 'https://picsum.photos/seed/sanya1/800/600', caption: '海滩', sortOrder: 0 },
];

function makeCursor(createdAt: Date, id: number): string {
  return `${createdAt.toISOString()}_${id}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get('cursor');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
  const topic = searchParams.get('topic');

  let posts = [...MOCK_POSTS];
  
  if (topic && topic !== '推荐') {
    posts = posts.filter((p) => p.topic === topic);
  }

  if (cursor) {
    const [cursorCreatedAt, cursorId] = cursor.split('_');
    const cursorDate = new Date(cursorCreatedAt);
    const cursorNumId = parseInt(cursorId);
    posts = posts.filter(
      (p) => p.createdAt < cursorDate || (p.createdAt.getTime() === cursorDate.getTime() && p.id < cursorNumId)
    );
  }

  posts.sort((a, b) => {
    if (a.createdAt !== b.createdAt) return b.createdAt.getTime() - a.createdAt.getTime();
    return b.id - a.id;
  });

  const sliced = posts.slice(0, limit);
  const hasMore = posts.length > limit;
  const feedPosts: FeedPostDTO[] = sliced.map((p) => {
    const images = MOCK_IMAGES.filter((i) => i.postId === p.id).sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      id: String(p.id),
      title: p.title,
      topic: p.topic,
      author: '旅行达人',
      avatar: 'https://i.pravatar.cc/48?u=travel-1',
      coverImageUrl: p.coverImageUrl || '',
      gallery: images.map((i) => i.url),
      commentsCnt: p.commentsCnt,
      favoritesCnt: p.favoritesCnt,
      createdAt: p.createdAt.toISOString(),
      cursor: makeCursor(p.createdAt, p.id),
    };
  });

  const nextCursor = hasMore ? makeCursor(sliced[sliced.length - 1].createdAt, sliced[sliced.length - 1].id) : null;

  return NextResponse.json({ posts: feedPosts, nextCursor, hasMore });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as CreatePostPayload;
  const { title, content, privacy, topic, imageIds } = body;

  const id = MOCK_POSTS.length + 1;
  const newPost: PostRecord = {
    id,
    userId: 1,
    title,
    content,
    coverImageUrl: imageIds.length > 0 ? `https://picsum.photos/seed/${imageIds[0]}/400/300` : null,
    privacy,
    topic: topic || '推荐',
    commentsCnt: 0,
    favoritesCnt: 0,
    createdAt: new Date(),
  };

  MOCK_POSTS.push(newPost);

  imageIds.forEach((imgId, idx) => {
    MOCK_IMAGES.push({
      id: MOCK_IMAGES.length + 1,
      postId: id,
      url: `https://picsum.photos/seed/${imgId}/800/600`,
      caption: '',
      sortOrder: idx,
    });
  });

  const detailPost: DetailPostDTO = {
    id: String(newPost.id),
    title: newPost.title,
    content: newPost.content,
    topic: newPost.topic,
    author: '你',
    avatar: 'https://i.pravatar.cc/48?u=self',
    images: imageIds.map((imgId, idx) => ({
      id: imgId,
      url: `https://picsum.photos/seed/${imgId}/800/600`,
      caption: '',
    })),
    commentsCnt: 0,
    favoritesCnt: 0,
    createdAt: newPost.createdAt.toISOString(),
  };

  return NextResponse.json(detailPost, { status: 201 });
}
