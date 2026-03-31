'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clampImageIndex, resolveMainImageSrc, sanitizeGalleryImages } from './utils/galleryUtils';
import { InfoColumn } from './components/InfoColumn';
import { MediaColumnTranslateX as MediaColumn } from './components/MediaColumnTranslateX';
import { modalStyles as s } from './styles/modalStyles';
import type { CommentItem, PostDetailModalProps } from './types';

export type { PostDetailModalProps } from './types';

const SEED_COMMENTS: CommentItem[] = [
  { id: '1', name: '旅行小白', avatar: 'https://i.pravatar.cc/40?u=travel-1', text: '路线很实用，已收藏。', time: '2小时前' },
  { id: '2', name: '街拍爱好者', avatar: 'https://i.pravatar.cc/40?u=travel-2', text: '这个机位太绝了，下周就去试。', time: '4小时前' },
  { id: '3', name: '背包客阿澄', avatar: 'https://i.pravatar.cc/40?u=travel-3', text: '预算信息很有参考价值。', time: '昨天' },
];

export function PostDetailModal({
  open,
  onClose,
  cover,
  topic,
  title,
  content,
  author,
  avatar,
  comments = 12,
  favorites = 36,
  gallery,
}: PostDetailModalProps) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [commentList, setCommentList] = useState<CommentItem[]>(SEED_COMMENTS);
  const prevOverflowRef = useRef<string | null>(null);

  const images = useMemo(() => sanitizeGalleryImages(gallery, title, author), [gallery, title, author]);

  const mainSrc = useMemo(
    () => resolveMainImageSrc(images, activeImageIndex, cover),
    [images, activeImageIndex, cover]
  );

  useEffect(() => {
    // 关闭帖子后重置到初始图，保证下次打开从原图开始
    if (!open) {
      setActiveImageIndex(0);
      return;
    }
    setActiveImageIndex(0);
  }, [open]);

  useEffect(() => {
    setActiveImageIndex((i) => clampImageIndex(i, images.length));
  }, [images.length]);

  useEffect(() => {
    if (!open) return;
    prevOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflowRef.current ?? '';
      prevOverflowRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        // 图片查看层打开时，优先关闭查看层而不是直接关闭整个帖子浮窗。
        const viewerOpen = Boolean((window as any).__tripPostImageViewerOpen);
        if (viewerOpen) {
          window.dispatchEvent(new Event('trip:close-post-image-viewer'));
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  function submitComment() {
    const value = commentText.trim();
    if (!value) return;
    setCommentList((prev) => [
      { id: String(Date.now()), name: '你', avatar: 'https://i.pravatar.cc/40?u=self', text: value, time: '刚刚' },
      ...prev,
    ]);
    setCommentText('');
  }

  if (!open) return null;

  const modal = (
    <div
      role="presentation"
      data-trip-post-detail-modal="1"
      style={s.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="关闭帖子详情"
        style={s.closeFloat}
      >
        ×
      </button>

      <article
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-detail-modal-title"
        style={s.frame}
        onClick={(e) => e.stopPropagation()}
      >
        <MediaColumn
          mainSrc={mainSrc}
          images={images}
          activeImageIndex={activeImageIndex}
          onSelectImage={setActiveImageIndex}
          title={title}
        />

        <InfoColumn
          topic={topic}
          title={title}
          content={content}
          author={author}
          avatar={avatar}
          comments={comments}
          favorites={favorites}
          onClose={onClose}
          commentList={commentList}
          commentText={commentText}
          onCommentTextChange={setCommentText}
          onSubmitComment={submitComment}
        />
      </article>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}
