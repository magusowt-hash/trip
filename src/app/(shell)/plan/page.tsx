'use client';

import { useState, useRef, useEffect } from 'react';
import { DEMO_EXISTING_PLANS, formatPlanDateLine, groupPlansByYearMonth } from './planData';
import PlanMap from '@/components/PlanMap';
import styles from './plan-page.module.css';

const TABS = ['大交通', '详细行程', '行李清单', '预算账单', '攻略'] as const;

interface TransportItem {
  id: number;
  from: string;
  to: string;
  note: string;
  noteExpanded?: boolean;
  startDate?: string;
  endDate?: string;
}

interface ItineraryItem {
  id: number;
  title: string;
  time: string;
  note: string;
  importance: 'red' | 'yellow' | 'green';
  expanded?: boolean;
}

const PACK_CATEGORIES = ['通用类', '境外旅行', '徒步旅行', '登山/爬山', '海边旅行'];
const PACK_TEMPLATES = ['身份证', '手机', '充电器', '充电宝', '护照', '钱包', '换洗衣物', '洗漱用品'];

interface PackingItem {
  id: number;
  name: string;
}

const BUDGET_COLORS = ['#81c784', '#3d5afe', '#e68933', '#f0d06b', '#8ee4d1', '#d85c9b', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4'];

interface BudgetItem {
  id: number;
  category: string;
  amount: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface ImportedPost {
  id: number;
  title: string;
  coverImageUrl?: string | null;
}

export default function PlanPage() {
  const grouped = groupPlansByYearMonth(DEMO_EXISTING_PLANS);

  return (
    <div className={styles.root}>
      <div className={styles.split}>
        <PlanDraftPanel />
        <PlanTimelinePanel grouped={grouped} />
      </div>
    </div>
  );
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const formatDate = (d: Date) => {
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${m.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  };
  return `${formatDate(startDate)} → ${formatDate(endDate)}`;
}

function PlanDraftPanel() {
  const [markers, setMarkers] = useState<{ position: [number, number]; title: string }[]>([]);

  return (
    <section className={styles.draftCol} aria-label="地图">
      <div className={styles.mapContainer}>
        <PlanMap markers={markers} autoLoadMarkers />
      </div>
    </section>
  );
}

function PlanTimelinePanel({
  grouped,
}: {
  grouped: ReturnType<typeof groupPlansByYearMonth>;
}) {
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<{ id: number; name: string; items: any[]; startDate?: string; endDate?: string } | null>(null);
  const [userPlans, setUserPlans] = useState<{ id: number; name: string; start_date?: string; end_date?: string }[]>([]);
  const [editingPlan, setEditingPlan] = useState<{ id: number; name: string; items: any[] } | null>(null);

  useEffect(() => {
    fetch('/api/plans')
      .then((res) => res.json())
      .then((data) => {
        if (data.plans) {
          setUserPlans(data.plans);
        }
      })
      .catch((err) => console.error('Failed to fetch plans:', err));
  }, []);

  const handleViewPlan = (plan: { id: number; name: string; start_date?: string; end_date?: string }) => {
    fetch(`/api/plans/${plan.id}`)
      .then((res) => res.json())
      .then((data) => {
        setSelectedPlan({ 
          ...plan, 
          items: data.items || [],
          startDate: data.start_date,
          endDate: data.end_date
        });
        setShowViewModal(true);
      })
      .catch((err) => console.error('Failed to fetch plan details:', err));
  };

  const handleEditFromView = (plan: { id: number; name: string; items: any[]; startDate?: string; endDate?: string }) => {
    setShowViewModal(false);
    setEditingPlan(plan);
    setShowModal(true);
  };

  return (
    <section className={styles.timelineCol} aria-label="我的计划">
      <div className={styles.timelineTrack}>
        <h2 className={styles.timelineHeading}>我的计划</h2>
        {userPlans.length === 0 ? (
          <p className={styles.emptyRight}>暂无计划</p>
        ) : (
          userPlans.map((plan) => (
            <div key={plan.id} className={styles.planRow} onClick={() => handleViewPlan(plan)}>
              <p className={styles.planTitle}>
                {plan.name}
                {plan.start_date && plan.end_date && (
                  <span className={styles.dateLine}> ({formatDateRange(plan.start_date, plan.end_date)})</span>
                )}
              </p>
            </div>
          ))
        )}
        <button
          type="button"
          className={styles.createPlanButton}
          onClick={() => setShowModal(true)}
        >
          制定计划
        </button>
        {showModal && <PlanModal onClose={() => { setShowModal(false); setEditingPlan(null); }} editPlan={editingPlan} />}
        {showViewModal && selectedPlan && (
          <PlanViewModal plan={selectedPlan} onClose={() => setShowViewModal(false)} onEdit={() => handleEditFromView(selectedPlan)} />
        )}
      </div>
    </section>
  );
}

interface PlanViewModalProps {
  plan: { id: number; name: string; items: any[]; startDate?: string; endDate?: string };
  onClose: () => void;
  onEdit: () => void;
}

function PlanViewModal({ plan, onClose, onEdit }: PlanViewModalProps) {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalRegion1}>
          <div className={styles.planInfo}>
            <span className={styles.planName}>
              {plan.name}
              {plan.startDate && plan.endDate && (
                <span className={styles.dateLine}> ({formatDateRange(plan.startDate, plan.endDate)})</span>
              )}
            </span>
            <button type="button" className={styles.editButton} onClick={onEdit}>
              编辑
            </button>
            <button type="button" className={styles.switchButton} onClick={onClose}>
              返回
            </button>
          </div>
        </div>
        <div className={styles.modalRegion22}>
          <div className={styles.viewContent}>
            {TABS.map((tab, idx) => (
              <div key={tab} className={styles.viewSection}>
                <h3 className={styles.viewSectionTitle}>{tab}</h3>
                <div className={styles.viewSectionContent}>
                  {tab === '大交通' && plan.items.length > 0 ? (
                    plan.items.map((item: any, i: number) => (
                      <div key={i} className={styles.viewTransportItem}>
                        <span>{item.from || '起点'}</span>
                        <span>→</span>
                        <span>{item.to || '终点'}</span>
                        {item.startDate && item.endDate && (
                          <span className={styles.dateLine}> {formatDateRange(item.startDate, item.endDate)}</span>
                        )}
                        {item.note && <span className={styles.viewNote}>{item.note}</span>}
                      </div>
                    ))
                  ) : (
                    <p className={styles.viewEmpty}>暂无内容</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanModal({ onClose, editPlan }: { onClose: () => void; editPlan?: { id: number; name: string; items: any[]; startDate?: string; endDate?: string } | null }) {
  const [activeTab, setActiveTab] = useState<number>(0);
  const [transportList, setTransportList] = useState<TransportItem[]>([
    { id: 1, from: '', to: '', note: '', noteExpanded: false, startDate: '', endDate: '' },
  ]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editField, setEditField] = useState<'from' | 'to' | 'note' | null>(null);
  const [planName, setPlanName] = useState(`trip-1`);
  const [isEditingName, setIsEditingName] = useState(false);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [itineraryList, setItineraryList] = useState<ItineraryItem[]>([
    { id: 1, title: '', time: '', note: '', importance: 'red', expanded: true },
  ]);
  const [packingList, setPackingList] = useState<PackingItem[]>([]);
  const [packingInput, setPackingInput] = useState<string>('');
  const [importedPosts, setImportedPosts] = useState<ImportedPost[]>([]);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [guidePage, setGuidePage] = useState(1);
  const [favoritePosts, setFavoritePosts] = useState<any[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [fetchedFavorites, setFetchedFavorites] = useState(false);

  const fetchFavoritePosts = async () => {
    setFavoritesLoading(true);
    try {
      const res = await fetch('/api/favorites', { credentials: 'include' });
      const data = await res.json();
      if (data.favorites) {
        setFavoritePosts(data.favorites);
      }
    } finally {
      setFavoritesLoading(false);
    }
  };

  const handleImportPost = (post: ImportedPost) => {
    if (importedPosts.length >= 10) return;
    if (importedPosts.some(p => p.id === post.id)) return;
    setImportedPosts([...importedPosts, post]);
  };

  const handleRemovePost = (id: number) => {
    setImportedPosts(importedPosts.filter(p => p.id !== id));
  };

  const handleItineraryUpdate = (id: number, field: 'title' | 'time' | 'note', value: string) => {
    setItineraryList(
      itineraryList.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const toggleImportance = (id: number) => {
    setItineraryList(
      itineraryList.map((item) => {
        if (item.id === id) {
          const colors: ItineraryItem['importance'][] = ['red', 'yellow', 'green'];
          const currentIdx = colors.indexOf(item.importance);
          const nextIdx = (currentIdx + 1) % 3;
          return { ...item, importance: colors[nextIdx] };
        }
        return item;
      })
    );
  };

  const handleItineraryAdd = () => {
    if (itineraryList.length >= 999) return;
    const newId = Math.max(...itineraryList.map((t) => t.id), 0) + 1;
    setItineraryList([...itineraryList, { id: newId, title: '', time: '', note: '', importance: 'red', expanded: false }]);
  };

  const handleItineraryDelete = (id: number) => {
    if (itineraryList.length <= 1) {
      setItineraryList(itineraryList.map((t) => ({ ...t, title: '', time: '', note: '' })));
      return;
    }
    setItineraryList(itineraryList.filter((t) => t.id !== id));
  };

  const toggleExpand = (id: number) => {
    setItineraryList(
      itineraryList.map((item) => (item.id === id ? { ...item, expanded: !item.expanded } : { ...item, expanded: false }))
    );
  };

  const renderItineraryList = () => {
    const activeItem = itineraryList.find(item => item.expanded);
    return (
      <div className={styles.itinerarySplit}>
        <div className={styles.itineraryLeftList}>
          {itineraryList.map((item, idx) => (
            <div
              key={item.id}
              className={`${styles.itineraryLeftCard} ${item.expanded ? styles.itineraryLeftCardActive : ''}`}
              onClick={() => toggleExpand(item.id)}
            >
              {idx > 0 && <div className={styles.itineraryConnector}>
                <span className={styles.itineraryFirstChar}>
                  {itineraryList[idx - 1].title.charAt(0) || '上'}
                </span>
              </div>}
              <div className={styles.itineraryLeftHeader}>
                <div
                  className={styles.itineraryDot}
                  style={{ backgroundColor: item.importance === 'red' ? '#ef4444' : item.importance === 'yellow' ? '#eab308' : '#22c55e' }}
                  onClick={(e) => { e.stopPropagation(); toggleImportance(item.id); }}
                />
                <span className={styles.itineraryLeftTitle}>{item.title || '自定义文本1'}</span>
              </div>
              <input
                className={styles.itineraryTimeInput}
                value={item.time}
                onChange={(e) => { e.stopPropagation(); handleItineraryUpdate(item.id, 'time', e.target.value); }}
                placeholder="自定义文本2"
              />
              <div className={styles.itineraryActions}>
                {itineraryList.length > 1 && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); handleItineraryDelete(item.id); }}>删除</button>
                )}
                <button type="button" onClick={(e) => { e.stopPropagation(); handleItineraryAdd(); }}>添加</button>
              </div>
            </div>
          ))}
        </div>
        <div className={styles.itineraryRightPanel}>
          {activeItem ? (
            <>
              <div className={styles.itineraryNoteHeader}>{activeItem.title || '自定义文本1'}</div>
              <textarea
                className={styles.itineraryNoteFull}
                value={activeItem.note}
                onChange={(e) => handleItineraryUpdate(activeItem.id, 'note', e.target.value)}
                placeholder="便签内容输入区域"
              />
            </>
          ) : (
            <div className={styles.itineraryEmpty}>请选择左侧项目查看详情</div>
          )}
        </div>
      </div>
    );
  };

  const handlePackingAdd = () => {
    const val = packingInput.trim();
    if (!val) return;
    const newId = Math.max(...packingList.map(t => t.id), 0) + 1;
    setPackingList([...packingList, { id: newId, name: val }]);
    setPackingInput('');
  };

  const handlePackingDelete = (id: number) => {
    setPackingList(packingList.filter(t => t.id !== id));
  };

  const handlePackingTemplate = (name: string) => {
    if (packingList.some(t => t.name === name)) return;
    const newId = Math.max(...packingList.map(t => t.id), 0) + 1;
    setPackingList([...packingList, { id: newId, name }]);
  };

  const renderPackingList = () => (
    <div className={styles.packingSplit}>
      <div className={styles.packingLeft}>
        <div className={styles.packingItems}>
          {packingList.map(item => (
            <div key={item.id} className={styles.packingItem}>
              <span>{item.name}</span>
              <button type="button" className={styles.packingDelBtn} onClick={() => handlePackingDelete(item.id)}>×</button>
            </div>
          ))}
        </div>
        <div className={styles.packingBottom}>
          <div className={styles.packingCircleBtn} />
          <input
            type="text"
            className={styles.packingInput}
            value={packingInput}
            onChange={(e) => setPackingInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePackingAdd()}
            placeholder="输入物品名称"
          />
          <button type="button" className={styles.packingConfirmBtn} onClick={handlePackingAdd}>确定</button>
        </div>
      </div>
      <div className={styles.packingRight}>
        <div className={styles.packingListBox}>
          <div className={styles.packingListTitle}>旅行分类</div>
          {PACK_CATEGORIES.map(cat => (
            <div key={cat} className={styles.packingListItem}>{cat}</div>
          ))}
        </div>
        <div className={styles.packingListBox}>
          <div className={styles.packingListTitle}>物品列表</div>
          {PACK_TEMPLATES.map(item => (
            <div
              key={item}
              className={styles.packingListItem}
              onClick={() => handlePackingTemplate(item)}
            >{item}</div>
          ))}
        </div>
      </div>
    </div>
  );
  const [budgetList, setBudgetList] = useState<BudgetItem[]>([]);
  const [budgetInput, setBudgetInput] = useState<Record<string, string>>({});

  const generatePosition = (existingBubbles: BudgetItem[]) => {
    const containerWidth = 1200;
    const containerHeight = 350;
    const width = 70 + Math.random() * 30;
    const height = 35 + Math.random() * 15;

    let attempts = 0;
    const maxAttempts = 300;
    let x = 0, y = 0;
    let valid = false;

    while (!valid && attempts < maxAttempts) {
      x = width / 2 + 20 + Math.random() * (containerWidth - width - 40);
      y = height / 2 + 20 + Math.random() * (containerHeight - height - 40);

      valid = true;
      for (const b of existingBubbles) {
        if (b.x !== undefined && b.y !== undefined) {
          const dx = Math.abs(x - b.x);
          const dy = Math.abs(y - b.y);
          const minX = (width + (b.width || 70)) / 2 + 12;
          const minY = (height + (b.height || 35)) / 2 + 12;
          if (dx < minX && dy < minY) {
            valid = false;
            break;
          }
        }
      }
      attempts++;
    }

    if (!valid) {
      x = containerWidth / 2;
      y = containerHeight / 2;
    }

    return { x, y, width, height };
  };

  const handleBudgetAdd = (categoryKey: string) => {
    const amount = parseInt(budgetInput[categoryKey] || '0');
    if (!amount || amount <= 0) return;
    if (budgetList.length >= 50) return;

    const existingBubbles = budgetList;
    const pos = generatePosition(existingBubbles);

    setBudgetList([...budgetList, {
      id: Date.now(),
      category: categoryKey,
      amount,
      ...pos,
    }]);
    setBudgetInput({ ...budgetInput, [categoryKey]: '' });
  };

  const handleBudgetDelete = (id: number) => {
    setBudgetList(budgetList.filter(b => b.id !== id));
  };

  const isEditing = !!editPlan;

  useEffect(() => {
    if (editPlan) {
      setPlanName(editPlan.name);
      if (editPlan.startDate) setStartDate(editPlan.startDate);
      if (editPlan.endDate) setEndDate(editPlan.endDate);
      if (editPlan.items && editPlan.items.length > 0) {
        setTransportList(
          editPlan.items.map((item, idx) => ({
            id: idx + 1,
            from: item.from || '',
            to: item.to || '',
            note: item.note || '',
            noteExpanded: item.noteExpanded || false,
            startDate: item.startDate || '',
            endDate: item.endDate || '',
          }))
        );
      }
    }
  }, [editPlan]);

  const handleEditPlanName = () => {
    setIsEditingName(true);
    setTimeout(() => planNameRef.current?.focus(), 0);
  };

  const handlePlanNameBlur = () => {
    setIsEditingName(false);
  };

  const handlePlanNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPlanName(e.target.value);
  };

  const handleSave = async () => {
    try {
      const method = isEditing ? 'PUT' : 'POST';
      const body: any = {
        name: planName,
        items: transportList,
        activeTab,
        startDate,
        endDate,
      };
      if (isEditing) {
        body.id = editPlan!.id;
      }

      const response = await fetch('/api/plans', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (response.ok) {
        alert('保存成功');
      } else {
        alert('保存失败: ' + JSON.stringify(data));
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('保存失败: ' + error);
    }
  };
  
  const planNameRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = (currentTo?: string) => {
    const newId = Math.max(...transportList.map((t) => t.id), 0) + 1;
    const newItem: TransportItem = {
      id: newId,
      from: currentTo || '',
      to: '',
      note: '',
      noteExpanded: false,
      startDate: '',
      endDate: '',
    };
    setTransportList([...transportList, newItem]);
  };

  const handleDelete = (id: number) => {
    if (transportList.length <= 1) {
      setTransportList(
        transportList.map((t) => {
          if (t.id === id) {
            return { ...t, from: '', to: '', note: '', noteExpanded: false, startDate: '', endDate: '' };
          }
          return t;
        })
      );
      return;
    }
    setTransportList(transportList.filter((t) => t.id !== id));
  };

const handleUpdate = (id: number, field: 'from' | 'to' | 'note' | 'startDate' | 'endDate', value: string) => {
    setTransportList(
      transportList.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
  };

  const getTotalAmount = () => {
    return budgetList.reduce((sum, item) => sum + item.amount, 0);
  };

  const handleOpenGuideModal = () => {
    if (!fetchedFavorites) {
      fetchFavoritePosts();
      setFetchedFavorites(true);
    }
    setShowGuideModal(true);
  };

  const renderGuideModal = () => {
    if (!showGuideModal) return null;
    const displayedFavorites = favoritePosts.slice((guidePage - 1) * 6, guidePage * 6);
    const totalPages = Math.ceil(favoritePosts.length / 6);
    return (
      <div className={styles.guideModalOverlay} onClick={() => setShowGuideModal(false)}>
        <div className={styles.guideModalContent} onClick={e => e.stopPropagation()}>
          <div className={styles.guideModalHeader}>
            <span className={styles.guideModalTitle}>选择攻略</span>
            <button type="button" className={styles.guideModalClose} onClick={() => setShowGuideModal(false)}>×</button>
          </div>
          {favoritesLoading ? (
            <div className={styles.guideModalLoading}>加载中...</div>
          ) : favoritePosts.length === 0 ? (
            <div className={styles.guideModalEmpty}>暂无收藏，快去收藏喜欢的帖子吧！</div>
          ) : (
            <>
              <div className={styles.guideModalGrid}>
                {displayedFavorites.map(post => (
                  <div
                    key={post.id}
                    className={styles.guideModalCard}
                    onClick={() => {
                      handleImportPost({ id: post.postId, title: post.title, coverImageUrl: post.coverImageUrl });
                      setShowGuideModal(false);
                    }}
                  >
                    <div className={styles.guideModalCardCover} style={{ backgroundImage: post.coverImageUrl ? `url(${post.coverImageUrl})` : undefined }} />
                    <div className={styles.guideModalCardTitle}>{post.title}</div>
                  </div>
                ))}
              </div>
              {totalPages > 1 && (
                <div className={styles.guideModalPager}>
                  {guidePage > 1 && <button type="button" onClick={() => setGuidePage(p => p - 1)}>上一页</button>}
                  <span>{guidePage} / {totalPages}</span>
                  {guidePage < totalPages && <button type="button" onClick={() => setGuidePage(p => p + 1)}>下一页</button>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const renderGuideList = () => {
    const count = importedPosts.length;
    return (
      <>
        {renderGuideModal()}
        <div className={styles.guideSplit}>
          <div className={styles.guideLeft}>
            {count === 0 && (
              <div className={styles.guideEmpty}>
                <div className={styles.guideTitle}>导入攻略</div>
                <div className={styles.guideHint}>暂无导入，点击下方添加</div>
                <button type="button" className={styles.guideAddBtn} onClick={handleOpenGuideModal}>+ 添加攻略</button>
              </div>
            )}
            {count === 1 && (
              <div className={styles.guidePost}>
                <div className={styles.guideTitle}>导入到帖子</div>
                <div className={styles.guidePostCard}>
                  {importedPosts[0].coverImageUrl && (
                    <div className={styles.guidePostCover} style={{ backgroundImage: `url(${importedPosts[0].coverImageUrl})` }} />
                  )}
                  <div className={styles.guidePostTitle}>{importedPosts[0].title}</div>
                  <button type="button" className={styles.guideRemoveBtn} onClick={() => handleRemovePost(importedPosts[0].id)}>删除</button>
                </div>
              </div>
            )}
            {count >= 2 && (
              <div className={styles.guidePosts}>
                <div className={styles.guideTitle}>导入攻略</div>
                <div className={styles.guidePostsGrid}>
                  {importedPosts.map(post => (
                    <div key={post.id} className={styles.guidePostCard}>
                      {post.coverImageUrl && (
                        <div className={styles.guidePostCover} style={{ backgroundImage: `url(${post.coverImageUrl})` }} />
                      )}
                      <div className={styles.guidePostTitle}>{post.title}</div>
                      <button type="button" className={styles.guideRemoveBtn} onClick={() => handleRemovePost(post.id)}>×</button>
                    </div>
                  ))}
                </div>
                {count < 10 && <button type="button" className={styles.guideAddBtn} onClick={handleOpenGuideModal}>+ 添加攻略</button>}
              </div>
            )}
          </div>
          <div className={styles.guideRight}>
            <div className={styles.guideTitle}>已导入 {count} 篇</div>
          </div>
        </div>
      </>
    );
  };

  const renderBudgetList = () => (
    <div className={styles.budgetContainer}>
      <div className={styles.bubbleArea}>
        <div className={styles.totalAmount}>{getTotalAmount()}</div>
        {budgetList.map((item, idx) => (
          <div
            key={item.id}
            className={styles.amountBubble}
            style={{
              left: (item.x || 0) - (item.width || 80) / 2,
              top: (item.y || 0) - (item.height || 40) / 2,
              width: item.width || 80,
              height: item.height || 40,
              borderTopColor: BUDGET_COLORS[idx % BUDGET_COLORS.length],
            }}
          >
            <span>{item.amount}</span>
            <button type="button" className={styles.bubbleDelBtn} onClick={() => handleBudgetDelete(item.id)}>×</button>
          </div>
        ))}
      </div>
      <div className={styles.budgetInputArea}>
        <div className={styles.budgetInputGroup}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className={styles.inputCell}>
              <input
                type="text"
                className={styles.amountInputMini}
                value={budgetInput[`cat${i}`] || ''}
                onChange={(e) => setBudgetInput({ ...budgetInput, [`cat${i}`]: e.target.value })}
                placeholder="金额"
              />
              <button type="button" className={styles.confirmBtn} onClick={() => handleBudgetAdd(`cat${i}`)}>添加</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderTransportList = () => (
    <div className={styles.transportList}>
      {transportList.map((item) => (
        <div key={item.id} className={styles.transportRow}>
          <span
            className={styles.transportItem}
            onClick={() => handleEdit(item.id, 'from')}
          >
            {editingId === item.id && editField === 'from' ? (
              <input
                ref={inputRef}
                className={styles.transportInput}
                value={item.from}
                onChange={(e) => handleUpdate(item.id, 'from', e.target.value)}
                onBlur={handleBlur}
                placeholder="起点"
              />
            ) : (
              <span className={item.from ? styles.filled : styles.placeholder}>
                {item.from || '起点'}
              </span>
            )}
          </span>
          <div className={styles.arrowContainer}>
            <span
              className={`${styles.transportNoteBubble} ${item.note ? styles.hasContent : ''} ${item.noteExpanded ? styles.noteExpanded : ''}`}
              onClick={() => {
                if (item.note.length > 8) {
                  toggleNoteExpand(item.id);
                } else {
                  handleEdit(item.id, 'note');
                }
              }}
            >
              {editingId === item.id && editField === 'note' ? (
                <input
                  ref={inputRef}
                  className={styles.transportInput}
                  value={item.note}
                  onChange={(e) => handleUpdate(item.id, 'note', e.target.value)}
                  onBlur={handleBlur}
                  placeholder="备注"
                />
              ) : (
                <span className={item.note ? styles.filled : styles.placeholder}>
                  {item.note ? (item.note.length > 8 && !item.noteExpanded ? item.note.slice(0, 8) + '...' : item.note) : '备注'}
                </span>
              )}
            </span>
            <div className={styles.arrowLine}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          <span
            className={styles.transportItem}
            onClick={() => handleEdit(item.id, 'to')}
          >
            {editingId === item.id && editField === 'to' ? (
              <input
                ref={inputRef}
                className={styles.transportInput}
                value={item.to}
                onChange={(e) => handleUpdate(item.id, 'to', e.target.value)}
                onBlur={handleBlur}
                placeholder="终点"
              />
            ) : (
              <span className={item.to ? styles.filled : styles.placeholder}>
                {item.to || '终点'}
              </span>
            )}
          </span>
          <input
            type="date"
            className={styles.transportDateInput}
            value={item.startDate || ''}
            onChange={(e) => handleUpdate(item.id, 'startDate', e.target.value)}
          />
          <span style={{ color: '#9ca3af', fontSize: '12px' }}>→</span>
          <input
            type="date"
            className={styles.transportDateInput}
            value={item.endDate || ''}
            onChange={(e) => handleUpdate(item.id, 'endDate', e.target.value)}
          />
          <button
            type="button"
            className={styles.transportAdd}
            onClick={() => handleAdd(item.to)}
          >
            +
          </button>
          <button
            type="button"
            className={styles.transportDelete}
            tabIndex={0}
            onClick={() => handleDelete(item.id)}
          >
            −
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalRegion1}>
          <div className={styles.planInfo}>
            {isEditingName ? (
              <input
                ref={planNameRef}
                className={styles.planNameInput}
                value={planName}
                onChange={handlePlanNameChange}
                onBlur={handlePlanNameBlur}
              />
            ) : (
              <span className={styles.planName}>{planName}</span>
            )}
            <button type="button" className={styles.editButton} onClick={handleEditPlanName}>
              编辑
            </button>
            <button type="button" className={styles.switchButton}>
              切换计划
            </button>
          </div>
          <div className={styles.planDateRange}>
            <input
              type="date"
              className={styles.planDateInput}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="开始日期"
            />
            <span className={styles.planDateSeparator}>→</span>
            <input
              type="date"
              className={styles.planDateInput}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="结束日期"
            />
          </div>
        </div>
        <div className={styles.modalRegion21}>
          <div className={styles.tabSection}>
            <div className={styles.tabList}>
              {TABS.map((tab, idx) => (
                <button
                  key={tab}
                  type="button"
                  className={`${styles.tabItem} ${activeTab === idx ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab(idx)}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.divider} />
          <div className={styles.importSection}>
            <button type="button" className={styles.importButton}>
              导入计划
            </button>
            <button type="button" className={styles.importButton} onClick={handleSave}>
              保存计划
            </button>
          </div>
        </div>
        <div className={styles.modalRegion22}>
          <div className={styles.region22Content}>
            {activeTab === 0
              ? renderTransportList()
              : activeTab === 1
              ? renderItineraryList()
              : activeTab === 2
              ? renderPackingList()
              : activeTab === 3
              ? renderBudgetList()
              : activeTab === 4
              ? renderGuideList()
              : activeTab > 4
              ? <div className={styles.tabContent}>{TABS[activeTab]} 内容</div>
              : null}
          </div>
        </div>
      </div>
    </div>
  );
}
