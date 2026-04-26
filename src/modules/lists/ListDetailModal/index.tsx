'use client';

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface ListDetailModalProps {
  open: boolean;
  onClose: () => void;
  item: {
    id: number;
    title: string;
    coverImage?: string | null;
    description?: string | null;
    lng?: string | null;
    lat?: string | null;
    address?: string | null;
    intro?: string | null;
    image_url?: string | null;
  };
  favorited?: boolean;
  visited?: boolean;
  rating?: number;
  comment?: string;
  onFavoriteClick?: () => void;
  onVisitedClick?: () => void;
  onRatingChange?: (rating: number, comment: string) => void;
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 120,
    background: 'rgba(17, 24, 39, 0.42)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 20px',
    boxSizing: 'border-box' as const,
    overflow: 'auto' as const,
  },
  closeFloat: {
    position: 'fixed' as const,
    top: 18,
    left: 18,
    zIndex: 130,
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.4)',
    background: 'rgba(0,0,0,0.35)',
    color: '#fff',
    fontSize: 20,
    lineHeight: 1,
    cursor: 'pointer',
  },
  frame: {
    position: 'relative' as const,
    zIndex: 1,
    width: 'min(960px, 90vw)',
    height: 'min(680px, 86vh)',
    maxWidth: '100%',
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 24px 48px rgba(17,24,39,0.24)',
    overflow: 'hidden',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 52%) minmax(0, 48%)',
    columnGap: 0,
    alignItems: 'stretch',
  },
  imagePanel: {
    minHeight: 0,
    minWidth: 0,
    height: '100%',
    background: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const,
    objectPosition: 'center',
  },
  infoPanel: {
    minHeight: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    background: '#fff',
    borderLeft: '1px solid #e5e7eb',
    overflow: 'hidden',
  },
  scrollContent: {
    flex: 1,
    overflow: 'auto' as const,
    padding: '20px 20px 16px',
    WebkitOverflowScrolling: 'touch',
  },
  title: {
    margin: '0 0 12px',
    fontSize: 22,
    fontWeight: 600,
    color: '#111827',
    lineHeight: 1.3,
  },
  description: {
    margin: '0 0 16px',
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 1.6,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 6,
  },
  sectionValue: {
    fontSize: 14,
    color: '#111827',
  },
  ratingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  star: {
    fontSize: 18,
    color: '#fbbf24',
  },
  starEmpty: {
    fontSize: 18,
    color: '#d1d5db',
  },
  ratingText: {
    fontSize: 14,
    color: '#4b5563',
    marginLeft: 4,
  },
  buttonRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 16,
  },
  favoriteBtn: {
    flex: 1,
    padding: '10px 16px',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#4b5563',
    fontSize: 14,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  favoriteBtnActive: {
    background: '#fef3c7',
    color: '#b45309',
  },
  visitedBtn: {
    flex: 1,
    padding: '10px 16px',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#4b5563',
    fontSize: 14,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  visitedBtnActive: {
    background: '#d1fae5',
    color: '#047857',
  },
  placeholderText: {
    fontSize: 13,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
};

export function ListDetailModal({
  open,
  onClose,
  item,
  favorited = false,
  visited = false,
  rating = 0,
  comment = '',
  onFavoriteClick,
  onVisitedClick,
  onRatingChange,
}: ListDetailModalProps) {
  const [localFavorited, setLocalFavorited] = useState(favorited);
  const [localVisited, setLocalVisited] = useState(visited);
  const [localRating, setLocalRating] = useState(rating);
  const [localComment, setLocalComment] = useState(comment || '');
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [tempRating, setTempRating] = useState(rating);
  const [tempComment, setTempComment] = useState(comment || '');
  const [showImagePreview, setShowImagePreview] = useState(false);
  const prevOverflowRef = useRef<string | null>(null);

  useEffect(() => {
    setLocalFavorited(favorited);
  }, [favorited]);

  useEffect(() => {
    setLocalVisited(visited);
  }, [visited]);

  useEffect(() => {
    setLocalRating(rating);
  }, [rating]);

  useEffect(() => {
    setLocalComment(comment || '');
  }, [comment]);

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
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const handleFavorite = () => {
    setLocalFavorited(prev => !prev);
    onFavoriteClick?.();
  };

  const handleVisitedClick = () => {
    setTempRating(localRating);
    setTempComment(localComment || '');
    setShowRatingModal(true);
  };

  const handleStarClick = (starIndex: number) => {
    const newRating = starIndex * 2;
    const finalRating = newRating === localRating ? 0 : newRating;
    setLocalRating(finalRating);
    onRatingChange?.(finalRating, localComment);
  };

  const handleCommentChange = (value: string) => {
    setLocalComment(value);
  };

  const handleCommentBlur = () => {
    onRatingChange?.(localRating, localComment);
  };

  if (!open) return null;

  const renderStars = () => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      const filled = i * 2 <= localRating;
      stars.push(
        <span
          key={i}
          style={{ ...(filled ? s.star : s.starEmpty), cursor: 'pointer' }}
          onClick={() => handleStarClick(i)}
        >
          ★
        </span>
      );
    }
    return stars;
  };

  const renderTempStars = () => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      const filled = i * 2 <= tempRating;
      stars.push(
        <span
          key={i}
          style={{ fontSize: 24, cursor: 'pointer', color: filled ? '#fbbf24' : '#d1d5db' }}
          onClick={() => setTempRating(i * 2)}
        >
          ★
        </span>
      );
    }
    return stars;
  };

  const modal = (
    <div
      role="presentation"
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
        aria-label="关闭"
        style={s.closeFloat}
      >
        ×
      </button>

      <article
        role="dialog"
        aria-modal="true"
        style={s.frame}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={s.imagePanel}>
          {item.coverImage ? (
            <img src={item.coverImage} alt={item.title} style={s.image} />
          ) : (
            <span style={{ color: '#9ca3af', fontSize: 14 }}>暂无图片</span>
          )}
        </div>

        <div style={s.infoPanel}>
          <div style={s.scrollContent}>
            <h2 style={s.title}>{item.title}</h2>
            
            <p style={s.description}>
              {item.description || '暂无描述'}
            </p>

            <div style={s.section}>
              <div style={s.sectionLabel}>位置</div>
              <div style={s.sectionValue}>
                {item.address || <span style={s.placeholderText}>（内容待填充）</span>}
              </div>
            </div>

            <div style={s.ratingRow}>
              <span style={s.sectionLabel}>评分</span>
              {renderStars()}
              <span style={s.ratingText}>{localRating > 0 ? `${localRating}.0` : '未评分'}</span>
            </div>

            <div style={s.buttonRow}>
              <button
                type="button"
                onClick={handleFavorite}
                style={{
                  ...s.favoriteBtn,
                  ...(localFavorited ? s.favoriteBtnActive : {}),
                }}
              >
                {localFavorited ? '★' : '☆'} 收藏
              </button>
              <button
                type="button"
                onClick={handleVisitedClick}
                style={{
                  ...s.visitedBtn,
                  ...(localVisited ? s.visitedBtnActive : {}),
                }}
              >
                {localVisited ? '✓' : '○'} 已去
              </button>
            </div>

            <div style={s.section}>
              <div style={s.sectionLabel}>简介</div>
              <div style={s.sectionValue}>
                {item.intro ? (
                  <span style={{ color: '#111827' }}>{item.intro}</span>
                ) : (
                  <span style={s.placeholderText}>（暂无简介）</span>
                )}
              </div>
            </div>

            <div style={s.section}>
              <div style={s.sectionLabel}>网络图片</div>
              <div style={s.sectionValue}>
                {item.image_url ? (
                  <div 
                    style={{ cursor: 'pointer' }}
                    onClick={() => setShowImagePreview(true)}
                  >
                    <img 
                      src={item.image_url} 
                      alt="网络图片" 
                      style={{ maxWidth: '100%', maxHeight: 150, borderRadius: 6, objectFit: 'cover' }} 
                    />
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>点击查看大图</div>
                  </div>
                ) : (
                  <span style={s.placeholderText}>（暂无网络图片）</span>
                )}
              </div>
            </div>

            <div style={s.section}>
              <div style={s.sectionLabel}>评价</div>
              <textarea
                value={localComment}
                onChange={(e) => handleCommentChange(e.target.value)}
                onBlur={handleCommentBlur}
                placeholder="写写你的评价..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid #d1d5db',
                  fontSize: 13,
                  color: '#111827',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {showRatingModal && (
              <div 
                style={{
                  position: 'fixed', inset: 0, zIndex: 140, background: 'rgba(0,0,0,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) setShowRatingModal(false);
                }}
              >
                <div 
                  style={{
                    background: '#fff', borderRadius: 12, padding: 20, width: 'min(360px, 90vw)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)'
                  }}
                >
                  <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, textAlign: 'center' }}>
                    评分与评价
                  </h3>
                  
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>评分</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {renderTempStars()}
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>评价</div>
                    <textarea
                      value={tempComment}
                      onChange={(e) => setTempComment(e.target.value)}
                      placeholder="写写你的评价..."
                      rows={3}
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: 8,
                        border: '1px solid #d1d5db', fontSize: 14, resize: 'vertical',
                        boxSizing: 'border-box', fontFamily: 'inherit'
                      }}
                    />
                  </div>
                  
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setShowRatingModal(false)}
                      style={{
                        padding: '10px 20px', borderRadius: 8, border: '1px solid #d1d5db',
                        background: '#fff', fontSize: 14, cursor: 'pointer'
                      }}
                    >
                      取消
                    </button>
                    <button
                      onClick={() => {
                        setLocalRating(tempRating);
                        setLocalComment(tempComment);
                        setLocalVisited(true);
                        onVisitedClick?.();
                        onRatingChange?.(tempRating, tempComment);
                        setShowRatingModal(false);
                      }}
                      style={{
                        padding: '10px 20px', borderRadius: 8, border: 'none',
                        background: '#3b82f6', color: '#fff', fontSize: 14, cursor: 'pointer'
                      }}
                    >
                      确定
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </article>
    </div>
  );

  const imagePreview = showImagePreview && item.image_url ? (
    <div 
      style={{ 
        position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.8)', 
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 
      }}
      onClick={() => setShowImagePreview(false)}
    >
      <img 
        src={item.image_url} 
        alt="预览" 
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
      />
      <button 
        onClick={() => setShowImagePreview(false)}
        style={{
          position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.2)',
          color: '#fff', border: 'none', borderRadius: '50%', width: 40, height: 40,
          fontSize: 20, cursor: 'pointer'
        }}
      >
        ×
      </button>
    </div>
  ) : null;

  if (typeof document === 'undefined') return null;
  return (
    <>
      {createPortal(modal, document.body)}
      {imagePreview && createPortal(imagePreview, document.body)}
    </>
  );
}