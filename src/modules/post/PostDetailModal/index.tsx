'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clampImageIndex, resolveMainImageSrc, sanitizeGalleryImages, FALLBACK_IMAGE } from './utils/galleryUtils';
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
  imagesCount,
  createdAt,
}: PostDetailModalProps) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [commentList, setCommentList] = useState<CommentItem[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localFavorites, setLocalFavorites] = useState(favorites);
  const [localComments, setLocalComments] = useState(commentCount);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const prevOverflowRef = useRef<string | null>(null);

  // Use cover as fallback image for immediate display while loading
  const fallbackImages = cover ? [cover] : [];
  const images = useMemo(() => {
    if (gallery && gallery.length > 0) {
      const loadedImages = sanitizeGalleryImages(gallery, title, author);
      if (loadedImages.length > 0) {
        return loadedImages;
      }
    }
    // If no loaded images but we know the count, create placeholders
    if (imagesCount && imagesCount > 0) {
      const placeholder = cover || FALLBACK_IMAGE;
      return Array.from({ length: imagesCount }, () => placeholder);
    }
    return fallbackImages;
  }, [gallery, title, author, cover, imagesCount]);

  const thumbs = useMemo(() => {
    if (thumbnails && thumbnails.length > 0) {
      const sanitizedThumbs = sanitizeGalleryImages(thumbnails, title, author);
      return images.map((_, i) => sanitizedThumbs[i] || images[i]);
    }
    // If no thumbnails but we have images, use images as thumbnails
    if (images.length > 0) {
      return images;
    }
    // If we know the image count but no images yet, create placeholders
    if (imagesCount && imagesCount > 0) {
      return Array.from({ length: imagesCount }, () => cover || '');
    }
    return [];
  }, [thumbnails, images, title, author, cover, imagesCount]);

  const mainSrc = useMemo(
    () => resolveMainImageSrc(images, activeImageIndex, cover),
    [images, activeImageIndex, cover]
  );

  useEffect(() => {
    if (!open) {
      setActiveImageIndex(0);
      setCommentList([]);
      setReplyingTo(null);
      return;
    }
    setActiveImageIndex(0);

    if (!postId) return;
    setLoadingComments(true);
    fetch(`/api/posts/${postId}/comments`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.comments) {
          // Ensure each comment has parentId
          const commentsWithParentId = data.comments.map((c: any) => ({
            id: c.id,
            author: c.author,
            avatar: c.avatar,
            content: c.content,
            parentId: c.parentId || null,
            createdAt: c.createdAt,
          }));
          setCommentList(commentsWithParentId);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingComments(false));
  }, [open, postId]);

  useEffect(() => {
    setLocalFavorites(favorites);
  }, [favorites]);

  useEffect(() => {
    setLocalComments(commentCount);
  }, [commentCount]);

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
      const body = {
        content: value,
        parentId: replyingTo ? parseInt(replyingTo) : undefined,
      };
      
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || '评论失败');
        return;
      }

      const data = await res.json();
      if (data.comment) {
        // Ensure the comment has parentId
        const newComment: CommentItem = {
          id: data.comment.id,
          author: data.comment.author,
          avatar: data.comment.avatar,
          content: data.comment.content,
          parentId: data.comment.parentId || null,
          createdAt: data.comment.createdAt,
        };
        setCommentList((prev) => [newComment, ...prev]);
        setLocalComments((prev) => prev + 1);
      }
      setCommentText('');
      setReplyingTo(null);
    } catch {
      alert('评论失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFavorite() {
    if (!postId) return;
    try {
      const res = await fetch(`/api/posts/${postId}/favorite`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || '操作失败');
        return;
      }
      const data = await res.json();
      setLocalFavorites(data.favoritesCnt);
    } catch {
      alert('操作失败');
    }
  }

  function handleReplyClick(commentId: string, author: string) {
    if (commentId === '') {
      // Cancel reply
      setReplyingTo(null);
      return;
    }
    setReplyingTo(commentId);
    // Optionally focus the input field
    // You could add "@author " to the input text
    // For now, just set the state, placeholder will show
  }

  function cancelReply() {
    setReplyingTo(null);
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
          comments={localComments}
          favorites={localFavorites}
          createdAt={createdAt}
          onClose={onClose}
          commentList={commentList}
          loading={loadingComments}
          commentText={commentText}
          onCommentTextChange={setCommentText}
          onSubmitComment={submitComment}
          onFavoriteClick={handleFavorite}
          onReplyClick={handleReplyClick}
          replyingTo={replyingTo}
        />
      </article>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}