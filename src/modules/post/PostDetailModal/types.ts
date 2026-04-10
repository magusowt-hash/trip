export type CommentItem = {
  id: string;
  name: string;
  avatar: string;
  text: string;
  time: string;
};

export type PostDetailModalProps = {
  open: boolean;
  onClose: () => void;
  cover: string;
  topic: string;
  title: string;
  content?: string;
  author: string;
  avatar?: string;
  comments?: number;
  favorites?: number;
  gallery?: string[];
};
