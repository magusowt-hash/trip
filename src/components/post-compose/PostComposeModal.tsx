'use client';

import type { MutableRefObject } from 'react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { MediaColumnTranslateX } from '@/modules/post/PostDetailModal/components/MediaColumnTranslateX';
import { WHEEL_TO_SCROLL_FACTOR } from '@/modules/post/PostDetailModal/utils/galleryUtils';
import styles from './post-compose.module.css';

const DRAFT_KEY = 'trip-publish-draft-v1';
const MAX_IMAGES = 20;

type Privacy = 'public' | 'private';

type ImageItem = {
  id: string;
  url: string;
  caption: string;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function serializeComposeSession(title: string, content: string, privacy: Privacy, images: ImageItem[]) {
  return JSON.stringify({
    title,
    content,
    privacy,
    images: images.map((i) => ({ id: i.id, caption: i.caption })),
  });
}

function animateThumbRailScroll(rail: HTMLDivElement, targetLeft: number, rafRef: MutableRefObject<number | null>) {
  if (rafRef.current !== null) {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }
  const startLeft = rail.scrollLeft;
  const delta = targetLeft - startLeft;
  if (Math.abs(delta) < 0.5) {
    rail.scrollLeft = targetLeft;
    return;
  }
  const duration = 260;
  const startAt = performance.now();
  const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
  const frame = (now: number) => {
    const t = Math.min(1, (now - startAt) / duration);
    rail.scrollLeft = startLeft + delta * easeOutCubic(t);
    if (t < 1) {
      rafRef.current = requestAnimationFrame(frame);
    } else {
      rafRef.current = null;
    }
  };
  rafRef.current = requestAnimationFrame(frame);
}

export function PostComposeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [publishing, setPublishing] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const fileInputId = useId();
  /** 与 images 同步，选图合并时用「当前列表」避免 Strict Mode 双调 updater 与闭包竞态 */
  const imagesRef = useRef<ImageItem[]>([]);
  imagesRef.current = images;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftHydratedRef = useRef(false);
  /** 本次打开弹窗时的快照，用于判断是否有改动（含图片顺序与配文） */
  const [sessionBaseline, setSessionBaseline] = useState<string | null>(null);
  /** 打开并完成本地草稿 hydrate 后递增，驱动 layout 基线只打一次且能拿到 LS 回填后的 state */
  const [hydrationTick, setHydrationTick] = useState(0);
  const thumbRailRef = useRef<HTMLDivElement | null>(null);
  const thumbWrapRefs = useRef<(HTMLDivElement | null)[]>([]);
  const thumbAlignRafRef = useRef<number | null>(null);

  const hasDraft = images.length > 0 || title.trim().length > 0 || content.trim().length > 0;
  const canPublish = hasDraft;

  const activeImage = images[activeIndex] ?? null;
  const imageUrls = useMemo(() => images.map((i) => i.url), [images]);
  const mainGallerySrc = imageUrls[activeIndex] ?? '';

  const flushDraft = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          v: 4,
          title,
          content,
          privacy,
        }),
      );
    } catch {
      /* quota */
    }
  }, [title, content, privacy]);

  const isDirty = useMemo(() => {
    if (!open || sessionBaseline === null) return false;
    return serializeComposeSession(title, content, privacy, images) !== sessionBaseline;
  }, [open, sessionBaseline, title, content, privacy, images]);

  /** 无改动直接关；有改动询问是否存草稿，否时清空本地草稿并撤销预览图 */
  const requestExit = useCallback(() => {
    if (!isDirty) {
      onClose();
      return;
    }
    const save = window.confirm(
      '检测到未保存的改动，是否保存为草稿？\n\n确定：保存草稿并关闭\n取消：不保存并清空内容后关闭',
    );
    if (save) {
      flushDraft();
      onClose();
      return;
    }
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* */
    }
    imagesRef.current.forEach((i) => URL.revokeObjectURL(i.url));
    onClose();
  }, [isDirty, flushDraft, onClose]);

  useEffect(() => {
    if (!open) {
      setSessionBaseline(null);
      setImages((prev) => {
        prev.forEach((i) => URL.revokeObjectURL(i.url));
        return [];
      });
      setActiveIndex(0);
      setTitle('');
      setContent('');
      setPrivacy('public');
      setPublishing(false);
      draftHydratedRef.current = false;
      setHydrationTick(0);
      return;
    }

    if (draftHydratedRef.current) return;
    draftHydratedRef.current = true;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const data = JSON.parse(raw) as {
          v?: number;
          title?: string;
          content?: string;
          privacy?: Privacy;
        };
        if (typeof data.title === 'string') setTitle(data.title);
        if (typeof data.content === 'string') setContent(data.content);
        if (data.privacy) setPrivacy(data.privacy);
      }
    } catch {
      /* ignore */
    }
    setHydrationTick((x) => x + 1);
  }, [open]);

  /**
   * 仅在 open / hydrationTick 变化时打基线（hydrate 完成后那一次），不随每次输入重跑。
   * 若 effect 依赖 title/content 且每次重跑都 setSessionBaseline，可能在 baseline state 尚未提交时
   * 用「已编辑后的正文」覆盖基线，导致 isDirty 恒为 false。
   */
  useLayoutEffect(() => {
    if (!open) return;
    if (!draftHydratedRef.current) return;
    if (hydrationTick === 0) return;
    setSessionBaseline(serializeComposeSession(title, content, privacy, images));
    // hydrationTick 递增时的 render 已包含 LS 回填后的 title/content/privacy 与当前 images
  }, [open, hydrationTick]); // eslint-disable-line react-hooks/exhaustive-deps -- 基线只在 hydrate 完成时打一次

  useEffect(() => {
    if (!open) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => flushDraft(), 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [open, flushDraft]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if ((window as unknown as { __tripPostImageViewerOpen?: boolean }).__tripPostImageViewerOpen) return;
      requestExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, requestExit]);

  useEffect(() => {
    if (!images.length) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex((i) => (i >= images.length ? images.length - 1 : i));
  }, [images.length]);

  /** 与帖子详情轨一致：当前缩略图尽量滚到轨道中央（主图滚轮/全屏切换后仍可见） */
  useLayoutEffect(() => {
    if (!open || images.length === 0) return;
    const rail = thumbRailRef.current;
    const wrap = thumbWrapRefs.current[activeIndex];
    if (!rail || !wrap) return;
    const targetLeft = wrap.offsetLeft - (rail.clientWidth - wrap.offsetWidth) / 2;
    const maxLeft = rail.scrollWidth - rail.clientWidth;
    const nextLeft = clamp(targetLeft, 0, Math.max(maxLeft, 0));
    animateThumbRailScroll(rail, nextLeft, thumbAlignRafRef);
  }, [open, images.length, activeIndex]);

  useEffect(() => {
    return () => {
      if (thumbAlignRafRef.current !== null) {
        cancelAnimationFrame(thumbAlignRafRef.current);
        thumbAlignRafRef.current = null;
      }
    };
  }, []);

  /** React 默认 wheel 为 passive，无法 preventDefault；用 capture 在轨道上横向滚动 */
  useEffect(() => {
    if (!open || images.length === 0) return;
    const el = thumbRailRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      el.scrollLeft += delta * WHEEL_TO_SCROLL_FACTOR;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open, images.length]);

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files = input.files;
    if (!files?.length) {
      setTimeout(() => {
        input.value = '';
      }, 0);
      return;
    }
    const list = Array.from(files);
    const prev = imagesRef.current;
    const room = MAX_IMAGES - prev.length;
    const slice = list.slice(0, Math.max(0, room));
    const next: ImageItem[] = slice.map((file) => ({
      id: uid(),
      url: URL.createObjectURL(file),
      caption: '',
    }));
    const merged = [...prev, ...next];
    flushSync(() => {
      setImages(merged);
    });
    if (merged.length > 0) {
      setActiveIndex(merged.length - 1);
    }
    /** 延后清空，避免部分 WebKit 在 change 回调内清空导致预览异常 */
    setTimeout(() => {
      input.value = '';
    }, 0);
  };

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const updateCaption = useCallback((id: string, caption: string) => {
    setImages((prev) => prev.map((i) => (i.id === id ? { ...i, caption } : i)));
  }, []);

  const onThumbDragStart = (id: string) => setDragId(id);
  const onThumbDragEnd = () => setDragId(null);
  const onStripDragOver = (e: React.DragEvent) => e.preventDefault();
  const onThumbDrop = useCallback(
    (targetId: string) => {
      if (!dragId || dragId === targetId) return;
      setImages((prev) => {
        const from = prev.findIndex((i) => i.id === dragId);
        const to = prev.findIndex((i) => i.id === targetId);
        if (from < 0 || to < 0) return prev;
        const copy = [...prev];
        const [moved] = copy.splice(from, 1);
        copy.splice(to, 0, moved);
        return copy;
      });
      setDragId(null);
    },
    [dragId],
  );

  const doPublish = async () => {
    if (!canPublish || publishing) return;
    setPublishing(true);

    try {
      const imageIds: string[] = [];

      for (const img of images) {
        const blob = await fetch(img.url).then((r) => r.blob());
        const file = new File([blob], img.id, { type: blob.type });
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Image upload failed');
        const data = await response.json();
        imageIds.push(data.id);
      }

      const postResponse = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          privacy,
          topic: '推荐',
          imageIds,
        }),
        credentials: 'include',
      });

      if (!postResponse.ok) throw new Error('Post creation failed');

      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch { /* ignore */ }
      onClose();
    } catch {
      setPublishing(false);
    }
  };

  const overlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) requestExit();
  };

  const setThumbWrapRef = useCallback((el: HTMLDivElement | null, i: number) => {
    thumbWrapRefs.current[i] = el;
  }, []);

  const strip = useMemo(
    () =>
      images.map((img, i) => (
        <div key={img.id} className={styles.thumbWrap} ref={(el) => setThumbWrapRef(el, i)}>
          <button
            type="button"
            draggable
            onDragStart={() => onThumbDragStart(img.id)}
            onDragEnd={onThumbDragEnd}
            onDragOver={onStripDragOver}
            onDrop={() => onThumbDrop(img.id)}
            className={`${styles.thumb} ${i === activeIndex ? styles.thumbActive : ''}`}
            onClick={() => setActiveIndex(i)}
            aria-label={`图片 ${i + 1}`}
          >
            <img src={img.url} alt="" draggable={false} />
          </button>
          <button
            type="button"
            className={styles.thumbRemove}
            aria-label="移除图片"
            onClick={(e) => {
              e.stopPropagation();
              removeImage(img.id);
            }}
          >
            ×
          </button>
        </div>
      )),
    [images, activeIndex, removeImage, onThumbDrop, setThumbWrapRef],
  );

  if (!open) return null;

  return (
    <div className={styles.overlay} role="presentation" onClick={overlayClick}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-compose-title"
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.exitTopLeft} onClick={requestExit} aria-label="退出">
          ×
        </button>
        <header className={styles.header}>
          <span className={styles.headerLeftSpacer} aria-hidden />
          <h2 id="post-compose-title" className={styles.headerTitle}>
            发布新内容
          </h2>
          <button
            type="button"
            className={`${styles.publishBtn} ${canPublish ? styles.publishBtnActive : styles.publishBtnIdle}`}
            disabled={!canPublish || publishing}
            onClick={doPublish}
          >
            {publishing ? '发布中…' : '发布'}
          </button>
        </header>

        <div className={styles.body}>
          <input
            id={fileInputId}
            type="file"
            accept="image/*"
            multiple
            className={styles.hiddenFile}
            onChange={onPickFiles}
            tabIndex={-1}
            aria-hidden="true"
          />

          <div className={styles.bodyThreeCol}>
            <div className={styles.colText}>
              <div className={styles.fieldLabel}>标题</div>
              <input
                className={styles.titleInput}
                type="text"
                placeholder="一句话标题…"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                aria-label="标题"
              />
              <div className={styles.fieldLabel}>正文</div>
              <textarea
                className={styles.bodyInput}
                placeholder="写点什么…"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
              />
            </div>

            <div className={styles.colMedia}>
              <div className={styles.mediaPanel}>
                {images.length === 0 ? (
                  <div className={styles.mainImageStageEmptyWrap}>
                    <label htmlFor={fileInputId} className={styles.addImageStageEmpty}>
                      + 添加图片（最多 {MAX_IMAGES} 张）
                    </label>
                  </div>
                ) : (
                  <div className={styles.mediaColumnHost}>
                    <MediaColumnTranslateX
                      mainSrc={mainGallerySrc}
                      images={imageUrls}
                      activeImageIndex={activeIndex}
                      onSelectImage={setActiveIndex}
                      title={title}
                      hideInlineThumbRail
                      disableViewerContextMenu
                    />
                  </div>
                )}
                <div className={styles.thumbPanel}>
                  <div className={styles.strip} ref={thumbRailRef} onDragOver={onStripDragOver}>
                    {images.length > 0 ? strip : null}
                    {images.length < MAX_IMAGES ? (
                      <label htmlFor={fileInputId} className={styles.addThumb} aria-label="添加图片">
                        +
                      </label>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.colMeta}>
              {activeImage ? (
                <div className={styles.metaBlock}>
                  <div className={styles.fieldLabel}>当前图配文</div>
                  <textarea
                    className={styles.captionInput}
                    placeholder="✏️ 为这张图写描述，支持 emoji"
                    value={activeImage.caption}
                    onChange={(e) => updateCaption(activeImage.id, e.target.value)}
                    rows={4}
                  />
                </div>
              ) : null}

              <div className={styles.metaBlock}>
                <div className={styles.fieldLabel}>地点</div>
                <p className={styles.hint}>地点选择将接入高德地图服务，当前版本暂未开放。</p>
              </div>

              <div className={styles.privacyBlock}>
                <div className={styles.privacyIntegrated}>
                  <span className={styles.privacyIcon} aria-hidden>
                    🔒
                  </span>
                  <span className={styles.privacyTitle}>隐私设置</span>
                  <select
                    className={styles.privacySelect}
                    value={privacy}
                    onChange={(e) => setPrivacy(e.target.value as Privacy)}
                    aria-label="隐私设置"
                  >
                    <option value="public">🌍 公开</option>
                    <option value="private">🔒 仅自己</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
