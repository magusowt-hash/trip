// Feed DTO - lightweight for lists
export type FeedPostDTO = {
  id: string;
  title: string;
  topic: string;
  author: string;
  avatar: string;
  coverImageUrl: string;
  gallery: string[];
  imagesCount: number;
  commentsCnt: number;
  favoritesCnt: number;
  createdAt: string;
  cursor: string;
};

export type FeedResponse = {
  posts: FeedPostDTO[];
  nextCursor: string | null;
  hasMore: boolean;
};

// Detail DTO - full view for modal
export type DetailImageDTO = {
  id: string;
  url: string;
  thumbnailUrl: string;
  caption: string;
};

export type DetailPostDTO = {
  id: string;
  title: string;
  content: string;
  topic: string;
  author: string;
  avatar: string;
  images: DetailImageDTO[];
  commentsCnt: number;
  favoritesCnt: number;
  createdAt: string;
};

export type DetailResponse = DetailPostDTO;

// Upload response
export type UploadResponse = {
  id: string;
  url: string;
  thumbnailUrl: string;
};

// Create post payload
export type CreatePostPayload = {
  title: string;
  content: string;
  privacy: 'public' | 'private';
  topic: string;
  imageIds: string[];
};

// User posts response
export type UserPostsResponse = FeedResponse;
