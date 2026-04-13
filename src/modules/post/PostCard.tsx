'use client';

import { useState, useEffect } from 'react';
import { PostDetailModal, type PostDetailModalProps } from '@/modules/post/PostDetailModal';

export type PostCardProps = Omit<PostDetailModalProps, 'open' | 'onClose'> & {
  postId: string;
  /** 仅主页流使用：整体约 1.15 倍，其它页面勿传 */
  feedEnlarged?: boolean;
};

export function PostCard(props: PostCardProps) {
  const { feedEnlarged = false, postId, cover, topic, title, author, avatar } = props;
  const [open, setOpen] = useState(false);
  const [detailContent, setDetailContent] = useState<string | undefined>(undefined);
  const [comments, setComments] = useState(0);
  const [favorites, setFavorites] = useState(0);
  const [gallery, setGallery] = useState<string[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [createdAt, setCreatedAt] = useState<string | undefined>(undefined);
  const s = feedEnlarged ? 1.15 : 1;

  useEffect(() => {
    if (open && postId) {
      fetch(`/api/posts/${postId}`, { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => {
          if (!data.error) {
            setDetailContent(data.content);
            setComments(data.commentsCnt);
            setFavorites(data.favoritesCnt);
            setGallery(data.images?.map((i: { url: string }) => i.url) || []);
            setThumbnails(data.images?.map((i: { url: string; thumbnailUrl?: string }) => i.thumbnailUrl || i.url) || []);
            setCreatedAt(data.createdAt);
          }
        })
        .catch(() => {});
    }
  }, [open, postId]);

  return (
    <>
      <button
        type="button"
        className="card post-card"
        aria-label={`打开帖子详情：${title}`}
        data-feed-enlarged={feedEnlarged ? true : undefined}
        style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}
        onClick={() => setOpen(true)}
      >
        <div className="post-cover-wrap">
          <img src={cover} alt={title} className="post-cover" />
          <span className="post-topic-tag">#{topic}</span>
        </div>
        <div
          className={`grid${feedEnlarged ? ' post-card-meta' : ''}`}
          style={{ padding: Math.round(12 * s), gap: Math.round(8 * s) }}
        >
          <strong style={{ lineHeight: 1.35, fontSize: feedEnlarged ? '1.15em' : undefined }}>{title}</strong>
          <div className="row" style={{ gap: Math.round(8 * s), minWidth: 0, alignItems: 'center' }}>
            <img src={avatar || `https://i.pravatar.cc/48?u=${encodeURIComponent(author)}`} alt={author} className="post-author-avatar" />
            <small className="post-author-name">{author}</small>
          </div>
        </div>
      </button>

      <PostDetailModal
        open={open}
        onClose={() => setOpen(false)}
        postId={postId}
        cover={cover}
        topic={topic}
        title={title}
        content={detailContent}
        author={author}
        avatar={avatar}
        comments={comments}
        favorites={favorites}
        gallery={gallery.length > 0 ? gallery : undefined}
        thumbnails={thumbnails.length > 0 ? thumbnails : undefined}
        createdAt={createdAt}
      />
    </>
  );
}