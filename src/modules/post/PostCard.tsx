'use client';

import { useState } from 'react';
import { PostDetailModal, type PostDetailModalProps } from '@/modules/post/PostDetailModal';

export type PostCardProps = Omit<PostDetailModalProps, 'open' | 'onClose'> & {
  /** 仅主页流使用：整体约 1.15 倍，其它页面勿传 */
  feedEnlarged?: boolean;
};

export function PostCard(props: PostCardProps) {
  const { feedEnlarged = false, ...modalFields } = props;
  const { cover, topic, title, author, avatar } = modalFields;
  const [open, setOpen] = useState(false);
  const s = feedEnlarged ? 1.15 : 1;

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

      <PostDetailModal {...modalFields} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
