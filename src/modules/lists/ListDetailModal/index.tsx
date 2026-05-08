'use client';

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './index.module.css';

export interface ListDetailModalProps {
  open: boolean;
  onClose: () => void;
  item: {
    id: number;
    title: string;
    coverImage?: string | null;
    description?: string | null;
    intro?: string | null;
    lng?: string | null;
    lat?: string | null;
    address?: string | null;
    image_url?: string | null;
    image_urls?: string[];
    transport_plane?: string | null;
    transport_train?: string | null;
    transport_bus?: string | null;
    rating_type?: string | null;
    custom_rating?: string | null;
  };
  favorited?: boolean;
  visited?: boolean;
  rating?: number;
  comment?: string;
  averageRating?: number;
  ratingCount?: number;
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
    width: 'min(1200px, 90vw)',
    aspectRatio: '2 / 1',
    maxHeight: '80vh',
    maxWidth: '100%',
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 24px 48px rgba(17,24,39,0.24)',
    overflow: 'hidden',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 50%) minmax(0, 50%)',
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
    userSelect: 'none' as const,
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    objectPosition: 'center',
    userSelect: 'none' as const,
    touchAction: 'none' as any,
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
    WebkitOverflowScrolling: 'touch',
  },
  title: {
    margin: '0 0 12px',
    fontSize: 30,
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
  twoColLeft: {},
  twoColRight: {
    textAlign: 'center' as const,
  },
  ratingBox: {
    borderRadius: 6,
    padding: '20px 10px',
    marginBottom: 20,
    width: '50%',
    display: 'inline-flex',
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 4,
    position: 'relative' as const,
  },
  ratingBoxLabel: {
    fontSize: 8,
    color: '#92400e',
    marginBottom: 0,
    lineHeight: 1,
  },
  ratingBoxScore: {
    fontSize: 50,
    fontWeight: 700,
    color: '#d97706',
  },
  twoColRow: {
    display: 'grid',
    gridTemplateColumns: '50% 50%',
    gap: 20,
    padding: '0 20px',
    marginBottom: 16,
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
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#4b5563',
    fontSize: 13,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  favoriteBtnActive: {
    background: '#fef3c7',
    color: '#b45309',
  },
  visitedBtn: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#4b5563',
    fontSize: 13,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
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
  introContainer: {
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  introText: {
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden' as const,
    wordBreak: 'break-word' as const,
  },
  introExpanded: {
    display: 'block',
  },
  introExpandBtn: {
    fontSize: 13,
    color: '#3b82f6',
    cursor: 'pointer',
    marginTop: 4,
  },
  imagesSection: {
    marginTop: 8,
  },
  imagesScroll: {
    display: 'flex',
    gap: 8,
    overflowX: 'auto' as const,
    WebkitOverflowScrolling: 'touch',
    paddingBottom: 8,
  },
  imageThumb: {
    width: 100,
    height: 100,
    objectFit: 'cover' as const,
    borderRadius: 6,
    cursor: 'pointer',
    flexShrink: 0,
  },
  reviewsSection: {
    marginTop: 16,
  },
  reviewItem: {
    padding: '12px 0',
    borderBottom: '1px solid #e5e7eb',
  },
  reviewUser: {
    fontSize: 13,
    fontWeight: 500,
    color: '#111827',
    marginBottom: 4,
  },
  reviewContent: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 1.5,
  },
  reviewExpandBtn: {
    display: 'block',
    width: '100%',
    padding: '10px 0',
    marginTop: 8,
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    background: '#fff',
    color: '#4b5563',
    fontSize: 14,
    cursor: 'pointer',
    textAlign: 'center' as const,
  },
  reviewExpanded: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 130,
    background: '#fff',
    padding: '20px 20px 16px',
    overflow: 'auto' as const,
  },
  reviewCloseBtn: {
    position: 'fixed' as const,
    top: 18,
    right: 18,
    zIndex: 140,
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.4)',
    background: 'rgba(0,0,0,0.35)',
    color: '#fff',
    fontSize: 20,
    cursor: 'pointer',
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
  averageRating = 0,
  ratingCount = 0,
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
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  const [modalAverageRating, setModalAverageRating] = useState(averageRating);
  const [modalRatingCount, setModalRatingCount] = useState(ratingCount);
  const [allReviews, setAllReviews] = useState<{id: number; userId: number; rating: number; comment: string; createdAt: string}[]>([]);
  const [reviewsExpanded, setReviewsExpanded] = useState(false);
  const [introExpanded, setIntroExpanded] = useState(false);
  const [showTransportModal, setShowTransportModal] = useState<'plane' | 'train' | 'bus' | null>(null);
  const [transportPopoverPos, setTransportPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const transportBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const prevOverflowRef = useRef<string | null>(null);

  useEffect(() => {
    fetch(`/api/ratings?averageOnly=true&targetType=list_item&targetId=${item.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.average !== undefined) {
          setModalAverageRating(data.average);
          setModalRatingCount(data.count || 0);
        }
      })
      .catch(() => {});
    
    fetch(`/api/ratings?allComments=true&targetType=list_item&targetId=${item.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.ratings && Array.isArray(data.ratings)) {
          setAllReviews(data.ratings);
        }
      })
      .catch(() => {});
  }, [item.id]);

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
    if (localVisited) {
      setLocalVisited(false);
      setLocalRating(0);
      setLocalComment('');
      onVisitedClick?.();
      onRatingChange?.(0, '');
      return;
    }
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
            <img src={item.coverImage} alt={item.title} style={s.image} draggable={false} />
          ) : (
            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>暂无图片</div>
          )}
        </div>

        <div style={s.infoPanel}>
          <div style={s.scrollContent}>
            <div style={s.twoColRow}>
              <div style={s.twoColLeft}>
                <div style={{ paddingTop: 20 }}>
                  <h2 style={s.title}>{item.title}</h2>
                  <p style={s.description}>
                    {item.description || '暂无描述'}
                  </p>
                  <div style={s.section}>
                    <div style={s.sectionValue}>
                      📍 {item.address || <span style={s.placeholderText}>（内容待填充）</span>}
                    </div>
                  </div>
                  {(item.transport_plane || item.transport_train || item.transport_bus) && (
                    <div style={{ ...s.section, display: 'flex', gap: 12 }}>
                      {item.transport_plane && (
                        <button
                          ref={el => { transportBtnRefs.current['plane'] = el; }}
                          type="button"
                          onClick={() => {
                            const btn = transportBtnRefs.current['plane'];
                            if (btn) {
                              const rect = btn.getBoundingClientRect();
                              setTransportPopoverPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
                            }
                            setShowTransportModal('plane');
                          }}
                          style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          ✈️ 飞机
                        </button>
                      )}
                      {item.transport_train && (
                        <button
                          ref={el => { transportBtnRefs.current['train'] = el; }}
                          type="button"
                          onClick={() => {
                            const btn = transportBtnRefs.current['train'];
                            if (btn) {
                              const rect = btn.getBoundingClientRect();
                              setTransportPopoverPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
                            }
                            setShowTransportModal('train');
                          }}
                          style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          🚄 火车
                        </button>
                      )}
                      {item.transport_bus && (
                        <button
                          ref={el => { transportBtnRefs.current['bus'] = el; }}
                          type="button"
                          onClick={() => {
                            const btn = transportBtnRefs.current['bus'];
                            if (btn) {
                              const rect = btn.getBoundingClientRect();
                              setTransportPopoverPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
                            }
                            setShowTransportModal('bus');
                          }}
                          style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          🚌 大巴
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div style={s.twoColRight}>
                <div style={{ paddingTop: 20 }}>
                  <div style={s.ratingBox}>
                    <div style={{
                      position: 'absolute',
                      fontSize: 94,
                      fontWeight: 900,
                      color: 'rgba(180,83,9,0.05)',
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      zIndex: 0,
                    }}>Trip</div>
                    <>
                      <div style={s.ratingBoxLabel}>评分</div>
                      {item.rating_type === 'custom' && item.custom_rating ? (
                        <div style={{
                          ...s.ratingBoxScore,
                          maxWidth: 100,
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          fontSize: Math.min(50, Math.round(100 / item.custom_rating.length)),
                        }}>{item.custom_rating}</div>
                      ) : modalAverageRating > 0 || modalRatingCount > 0 ? (
                        <div style={s.ratingBoxScore}>{modalAverageRating.toFixed(1)}</div>
                      ) : (
                        <div style={s.ratingText}>暂无评分</div>
                      )}
                    </>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 20, padding: '0 20px' }}>
                  <button
                    type="button"
                    onClick={handleFavorite}
                    style={{
                      ...s.favoriteBtn,
                      flex: 1,
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
                      flex: 1,
                      ...(localVisited ? s.visitedBtnActive : {}),
                    }}
                  >
                    {localVisited ? '✓' : '○'} 已去
                  </button>
                </div>
              </div>
            </div>

            <div style={{ ...s.section, paddingLeft: 20, paddingRight: 20 }}>
              <div style={s.sectionLabel}>简介</div>
              <div style={s.introContainer}>
                <div style={introExpanded ? s.introExpanded : s.introText}>
                  <span style={{ color: '#111827', paddingLeft: 20 }}>{item.intro || <span style={s.placeholderText}>（暂无简介）</span>}</span>
                </div>
                {item.intro && item.intro.length > 60 && (
                  <div style={s.introExpandBtn} onClick={() => setIntroExpanded(!introExpanded)}>
                    {introExpanded ? '收起' : '展开全部'}
                  </div>
                )}
              </div>
            </div>

            <div style={{ ...s.section, paddingLeft: 20, paddingRight: 20 }}>
              <div style={s.sectionLabel}>网络图片</div>
              <div style={s.imagesSection}>
                {(item.image_urls && item.image_urls.length > 0) || item.image_url ? (
                  <div style={s.imagesScroll}>
                    {(item.image_urls || (item.image_url ? item.image_url.split(',').filter(Boolean) : [])).map((url: string, idx: number) => (
                      <img 
                        key={idx}
                        src={url.trim()} 
                        alt={`网络图片${idx + 1}`} 
                        style={s.imageThumb}
                        onClick={() => {
                          setPreviewImageIndex(idx);
                          setShowImagePreview(true);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <span style={s.placeholderText}>（暂无网络图片）</span>
                )}
              </div>
            </div>

            <div style={{ ...s.section, paddingLeft: 20, paddingRight: 20 }}>
              <div style={s.sectionLabel}>评价</div>
              {allReviews.length > 0 ? (
                <>
                  <div style={reviewsExpanded ? { paddingBottom: 60 } : {}}>
                    {(reviewsExpanded ? allReviews : allReviews.slice(0, 2)).map((review, idx) => (
                      <div key={review.id} style={s.reviewItem}>
                        <div style={s.reviewUser}>用户{review.userId}</div>
                        <div style={{ marginBottom: 4 }}>
                          {[1,2,3,4,5].map(i => (
                            <span key={i} style={{ color: i * 2 <= review.rating ? '#fbbf24' : '#d1d5db', fontSize: 12 }}>★</span>
                          ))}
                        </div>
                        <div style={s.reviewContent}>{review.comment}</div>
                      </div>
                    ))}
                  </div>
                  {allReviews.length > 2 && !reviewsExpanded && (
                    <button style={s.reviewExpandBtn} onClick={() => setReviewsExpanded(true)}>
                      展开全部评价 ({allReviews.length})
                    </button>
                  )}
                </>
              ) : (
                <span style={s.placeholderText}>（暂无评价）</span>
              )}
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

  const imageList = item.image_urls && item.image_urls.length > 0 
    ? item.image_urls 
    : item.image_url 
      ? item.image_url.split(',').filter(Boolean).map((s: string) => s.trim())
      : [];

  const imagePreview = showImagePreview && imageList.length > 0 ? (
    <div 
      style={{ 
        position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.8)', 
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 
      }}
      onClick={() => setShowImagePreview(false)}
    >
      <img 
        src={imageList[previewImageIndex]} 
        alt="预览" 
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
      />
      {imageList.length > 1 && (
        <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8 }}>
          {imageList.map((_, idx) => (
            <div 
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                setPreviewImageIndex(idx);
              }}
              style={{
                width: 10, height: 10, borderRadius: '50%', 
                background: idx === previewImageIndex ? '#fff' : 'rgba(255,255,255,0.4)',
                cursor: 'pointer'
              }}
            />
          ))}
        </div>
      )}
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

  const reviewsExpandedView = reviewsExpanded ? (
    <div style={s.reviewExpanded}>
      <button style={s.reviewCloseBtn} onClick={() => setReviewsExpanded(false)}>×</button>
      <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600 }}>全部评价 ({allReviews.length})</h3>
      <div>
        {allReviews.map((review) => (
          <div key={review.id} style={s.reviewItem}>
            <div style={s.reviewUser}>用户{review.userId}</div>
            <div style={{ marginBottom: 4 }}>
              {[1,2,3,4,5].map(i => (
                <span key={i} style={{ color: i * 2 <= review.rating ? '#fbbf24' : '#d1d5db', fontSize: 12 }}>★</span>
              ))}
            </div>
            <div style={s.reviewContent}>{review.comment}</div>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  const currentTransport = showTransportModal === 'plane' ? item.transport_plane 
    : showTransportModal === 'train' ? item.transport_train 
    : showTransportModal === 'bus' ? item.transport_bus : null;
  const currentTransportItems = currentTransport ? currentTransport.split(',').filter(Boolean).map((s: string) => s.trim()) : [];

  const transportPopover = showTransportModal && currentTransportItems.length > 0 && transportPopoverPos ? (
    <div 
      style={{ 
        position: 'fixed', inset: 0, zIndex: 140 
      }}
      onClick={() => { setShowTransportModal(null); setTransportPopoverPos(null); }}
    >
      <div 
        style={{
          position: 'fixed',
          top: transportPopoverPos.top,
          left: transportPopoverPos.left,
          transform: 'translateX(-50%)',
          background: '#fff',
          borderRadius: 10,
          padding: 12,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          minWidth: 200,
          maxWidth: 260,
          maxHeight: 405,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
        className={styles.transportPopover}
      >
        <div style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderBottom: '8px solid #fff' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {currentTransportItems.map((info: string, idx: number) => (
            <div
              key={idx}
              style={{
                padding: '8px 12px', borderRadius: 6, border: '1px solid #e5e7eb', 
                background: '#f9fafb', fontSize: 13, color: '#374151'
              }}
            >
              {info}
            </div>
          ))}
        </div>
      </div>
    </div>
  ) : null;

  if (typeof document === 'undefined') return null;
  return (
    <>
      {createPortal(modal, document.body)}
      {imagePreview && createPortal(imagePreview, document.body)}
      {reviewsExpanded && createPortal(reviewsExpandedView, document.body)}
      {transportPopover && createPortal(transportPopover, document.body)}
    </>
  );
}