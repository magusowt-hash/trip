'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clampImageIndex, resolveMainImageSrc, sanitizeGalleryImages } from './utils/galleryUtils';
import { InfoColumn } from './components/InfoColumn';
import { MediaColumnTranslateX as MediaColumn } from './components/MediaColumnTranslateX';
import { modalStyles as s } from './styles/modalStyles';
import type { CommentItem, PostDetailModalProps } from './types';

export type { PostDetailModalProps } from './types';

export function PostDetailModal({
  open,
  onClose,
  postId,
  cover,
  topic,
  title,
  content,
  author,
  avatar,
  comments: commentCount = 0,
  favorites = 0,
  gallery,
  thumbnails,
  createdAt,
}: PostDetailModalProps) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [commentList, setCommentList] = useState<CommentItem[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const prevOverflowRef = useRef<string | null>(null);

  const images = useMemo(() => sanitizeGalleryImages(gallery, title, author), [gallery, title, author]);
  const thumbs = useMemo(() => {
    if (!thumbnails || thumbnails.length === 0) {
      return images;
    }
    const sanitizedThumbs = sanitizeGalleryImages(thumbnails, title, author);
    return images.map((_, i) => sanitizedThumbs[i] || images[i]);
  }, [thumbnails, images, title, author]);

  const mainSrc = useMemo(
    () => resolveMainImageSrc(images, activeImageIndex, cover),
    [images, activeImageIndex, cover]
  );

  useEffect(() => {
    if (!open) {
      setActiveImageIndex(0);
      setCommentList([]);
      return;
    }
    setActiveImageIndex(0);

    if (!postId) return;
    setLoadingComments(true);
    fetch(`/api/posts/${postId}/comments`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.comments) {
          setCommentList(data.comments);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingComments(false));
  }, [open, postId]);

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

  async function submitComment() {
    const value = commentText.trim();
    if (!value || !postId || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: value }),
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || '评论失败');
        return;
      }

      const data = await res.json();
      if (data.comment) {
        setCommentList((prev) => [data.comment, ...prev]);
      }
      setCommentText('');
    } catch {
      alert('评论失败');
    } finally {
      setSubmitting(false);
    }
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
          thumbnails={thumbs}
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
          comments={commentCount}
          favorites={favorites}
          createdAt={createdAt}
          onClose={onClose}
          commentList={commentList}
          loading={loadingComments}
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