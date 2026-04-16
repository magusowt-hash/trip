export type CommentItem = {
  id: string;
  author: string;
  avatar: string;
  content: string;
  parentId: string | null;
  createdAt: string;
};

export type PostDetailModalProps = {
  open: boolean;
  onClose: () => void;
  postId: string;
  cover: string;
  topic: string;
  title: string;
  content?: string;
  author: string;
  avatar?: string;
  comments?: number;
  favorites?: number;
  gallery?: string[];
  thumbnails?: string[];
  imagesCount?: number;
  createdAt?: string;
};