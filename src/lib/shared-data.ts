interface PostRecord {
  id: number;
  userId: number;
  title: string;
  content: string;
  coverImageUrl: string | null;
  imagesCount: number;
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
  thumbnailUrl: string;
  caption: string | null;
  sortOrder: number;
}

interface UploadedFile {
  id: string;
  url: string;
  thumbnailUrl: string;
}

interface CommentRecord {
  id: number;
  postId: number;
  userId: number;
  author: string;
  avatar: string;
  content: string;
  createdAt: Date;
}

interface EmbedAccessLog {
  id: number;
  ip: string;
  action: string;
  listId: number | null;
  itemId: number | null;
  userAgent: string;
  createdAt: Date;
}

const DEFAULT_POSTS: PostRecord[] = [];
const DEFAULT_IMAGES: ImageRecord[] = [];
const DEFAULT_COMMENTS: CommentRecord[] = [];

export function getGlobalPosts() {
  const g = global as unknown as {
    __SHARED_POSTS?: PostRecord[];
    __SHARED_IMAGES?: ImageRecord[];
    __SHARED_UPLOADS?: UploadedFile[];
    __SHARED_COMMENTS?: CommentRecord[];
    __SHARED_EMBED_LOGS?: EmbedAccessLog[];
  };

  if (!g.__SHARED_POSTS) {
    g.__SHARED_POSTS = [...DEFAULT_POSTS];
    g.__SHARED_IMAGES = [...DEFAULT_IMAGES];
    g.__SHARED_UPLOADS = [];
    g.__SHARED_COMMENTS = [...DEFAULT_COMMENTS];
    g.__SHARED_EMBED_LOGS = [];
  }

  return {
    posts: g.__SHARED_POSTS,
    images: g.__SHARED_IMAGES || [],
    uploaded: g.__SHARED_UPLOADS || [],
    comments: g.__SHARED_COMMENTS,
  };
}

export function getEmbedAccessLogs() {
  const g = global as unknown as {
    __SHARED_EMBED_LOGS?: EmbedAccessLog[];
  };
  if (!g.__SHARED_EMBED_LOGS) {
    g.__SHARED_EMBED_LOGS = [];
  }
  return g.__SHARED_EMBED_LOGS;
}

export type { PostRecord, ImageRecord, UploadedFile, CommentRecord, EmbedAccessLog };