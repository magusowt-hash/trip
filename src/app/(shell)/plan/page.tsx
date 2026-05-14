'use client';

import { useState, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
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
const CUSTOM_CAT_COLORS = ['#f43f5e', '#14b8a6', '#a855f7', '#eab308'];
const CURRENCIES = ['¥', '$', '€', '£', '₩', '฿'];

interface PackingItem {
  id: number;
  name: string;
}

interface PackingCategory {
  id: number;
  name: string;
  templates: string[];
}

interface BudgetItem {
  id: number;
  name: string;
  amount: number;
  note?: string;
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
  const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

  const [transportList, setTransportList] = useState<TransportItem[]>([
    { id: 1, from: '', to: '', note: '', noteExpanded: false, startDate: todayStr, endDate: todayStr },
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
  const [packingCategories, setPackingCategories] = useState<PackingCategory[]>([]);
  const [packingLoaded, setPackingLoaded] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [importedPosts, setImportedPosts] = useState<ImportedPost[]>([]);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [guidePage, setGuidePage] = useState(1);
  const [favoritePosts, setFavoritePosts] = useState<any[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [fetchedFavorites, setFetchedFavorites] = useState(false);
  const [notePopoverItemId, setNotePopoverItemId] = useState<number | null>(null);
  const [notePopoverText, setNotePopoverText] = useState('');
  const [notePopoverPos, setNotePopoverPos] = useState<{ top: number; left: number } | null>(null);

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
              <div className={styles.itineraryActionsWrap}>
                <div
                  className={styles.itineraryTag}
                  style={{ backgroundColor: item.importance === 'red' ? '#ef4444' : item.importance === 'yellow' ? '#eab308' : '#22c55e' }}
                  onClick={(e) => { e.stopPropagation(); toggleImportance(item.id); }}
                />
                <div className={styles.itineraryActions}>
                  <button type="button" className={`${styles.itineraryActionBtn} ${styles.itineraryDelBtn}`} onClick={(e) => { e.stopPropagation(); handleItineraryDelete(item.id); }} style={{ visibility: itineraryList.length > 1 ? 'visible' : 'hidden' }}>−</button>
                  <button type="button" className={`${styles.itineraryActionBtn} ${styles.itineraryAddBtn}`} onClick={(e) => { e.stopPropagation(); handleItineraryAdd(); }}>+</button>
                </div>
              </div>
              <div className={styles.itineraryLeftHeader}>
                <span
                  className={styles.itineraryLeftTitle}
                  style={{ color: item.title ? '#1d1d1f' : undefined }}
                >{item.title || '标题'}</span>
              </div>
              <input
                className={styles.itineraryTimeInput}
                style={{ color: item.time ? '#1d1d1f' : undefined }}
                value={item.time}
                onChange={(e) => { e.stopPropagation(); handleItineraryUpdate(item.id, 'time', e.target.value); }}
                placeholder="时间"
              />
            </div>
          ))}
        </div>
        <div className={styles.itineraryRightPanel}>
          {activeItem ? (
            <>
              <input
                className={styles.itineraryNoteHeader}
                value={activeItem.title}
                onChange={(e) => handleItineraryUpdate(activeItem.id, 'title', e.target.value)}
                placeholder="标题"
              />
              <textarea
                className={styles.itineraryNoteFull}
                value={activeItem.note}
                onChange={(e) => handleItineraryUpdate(activeItem.id, 'note', e.target.value)}
                placeholder="详细行程……"
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

  useEffect(() => {
    if (activeTab === 2 && !packingLoaded) {
      fetch('/api/packing')
        .then((res) => res.json())
        .then((data) => {
          if (data.categories) setPackingCategories(data.categories);
        })
        .catch(() => {})
        .finally(() => setPackingLoaded(true));
    }
  }, [activeTab, packingLoaded]);

  const renderPackingList = () => (
    <div className={styles.packingSplit}>
      <div className={styles.packingLeft}>
        <div className={styles.packingItems}>
          {packingList.map(item => (
            <div key={item.id} className={styles.packingItem}>
              <span className={styles.packingItemName}>{item.name}</span>
              <button type="button" className={styles.packingDelBtn} onClick={() => handlePackingDelete(item.id)}>×</button>
            </div>
          ))}
        </div>
        <div className={styles.packingBottom}>
          <div className={styles.packingCircleBtn}>+</div>
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
        {packingCategories.length > 0 ? (
          <>
            <div className={styles.packingListBox}>
              <div className={styles.packingListTitle}>旅行分类</div>
              {packingCategories.map(cat => (
                <div
                  key={cat.id}
                  className={styles.packingListItem}
                  onClick={() => setActiveCategoryId(activeCategoryId === cat.id ? null : cat.id)}
                  style={activeCategoryId === cat.id ? { background: '#eff6ff', borderColor: '#93c5fd', color: '#3b82f6' } : {}}
                >{cat.name}</div>
              ))}
            </div>
            <div className={styles.packingListBox}>
              <div className={styles.packingListTitle}>
                {activeCategoryId ? packingCategories.find(c => c.id === activeCategoryId)?.name || '物品列表' : '物品列表'}
              </div>
              {(activeCategoryId ? packingCategories.find(c => c.id === activeCategoryId)?.templates || [] : []).map(item => (
                <div
                  key={item}
                  className={styles.packingListItem}
                  onClick={() => handlePackingTemplate(item)}
                >{item}</div>
              ))}
              {!activeCategoryId && packingCategories.flatMap(c => c.templates).map(item => (
                <div
                  key={item}
                  className={styles.packingListItem}
                  onClick={() => handlePackingTemplate(item)}
                >{item}</div>
              ))}
              {activeCategoryId && packingCategories.find(c => c.id === activeCategoryId)?.templates.length === 0 && (
                <div style={{ color: '#c7c9cc', fontSize: 12, padding: 8 }}>暂无物品</div>
              )}
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
  const [budgetList, setBudgetList] = useState<BudgetItem[]>([]);
  const [budgetViewMode, setBudgetViewMode] = useState<'bubble' | 'list'>('bubble');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetNote, setBudgetNote] = useState('');
  const MAX_CHARS = 19.5;
  const getCharCount = (str: string) => {
    let count = 0;
    for (const char of str) {
      if (/[\u4e00-\u9fa5]/.test(char)) count += 1;
      else count += 0.5;
    }
    return count;
  };
  const canAddChar = (str: string) => getCharCount(str) <= MAX_CHARS;
  const handleNoteChange = (val: string) => { if (canAddChar(val)) setBudgetNote(val); };
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [currency, setCurrency] = useState('¥');
  const [pages, setPages] = useState<Record<number, { x: number; y: number }>[]>([{}]);
  const [pageNames, setPageNames] = useState<string[]>(['1']);
  const [currentPage, setCurrentPage] = useState(0);
  const [editingPageName, setEditingPageName] = useState(false);
  const [budgetNoteId, setBudgetNoteId] = useState<number | null>(null);
  const [budgetNoteText, setBudgetNoteText] = useState('');
  const [budgetNotePos, setBudgetNotePos] = useState<{ top: number; left: number } | null>(null);
  const [editingField, setEditingField] = useState<{ id: number; field: 'name' | 'amount' | 'note' } | null>(null);
  const [editValue, setEditValue] = useState('');
  const bubbleAreaRef = useRef<HTMLDivElement>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const adjustTextareaHeight = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 28) + 'px';
  };
  const CATEGORY_PRESETS = [
    { name: '酒店', color: '#f59e0b' },
    { name: '交通', color: '#3b82f6' },
    { name: '门票', color: '#8b5cf6' },
    { name: '购物', color: '#ec4899' },
    { name: '饮食', color: '#22c55e' },
    { name: '杂项', color: '#6b7280' },
  ];

  const allCategories = [
    ...CATEGORY_PRESETS,
    ...customCategories.map((name, i) => ({ name, color: CUSTOM_CAT_COLORS[i % CUSTOM_CAT_COLORS.length] })),
  ];

  const BUBBLE_W = 90, BUBBLE_H = 70, BUBBLE_REAL_W = 70, BUBBLE_REAL_H = 56, GAP = 7;
  const currentPagePositions = pages[currentPage] || {};

  const handleCategorySelect = (cat: string) => {
    if (selectedCategory === cat) {
      setSelectedCategory('');
      return;
    }
    setSelectedCategory(cat);
    setShowCustomInput(false);
  };

  const tryPlaceBubble = (existing: Record<number, { x: number; y: number }>, w: number, h: number): { x: number; y: number } | null => {
    const safeW = 260, safeH = 77;
    const pad = 6;
    const CELL_W = BUBBLE_W + GAP;
    const CELL_H = BUBBLE_H + GAP;
    const cols = Math.floor((w - pad * 2) / CELL_W);
    const rows = Math.floor((h - pad * 2) / CELL_H);
    const ids = Object.keys(existing).map(Number);
    const areaCx = w / 2, areaCy = h / 2;
    const safeMarginX = safeW / 2 + BUBBLE_W / 2;
    const safeMarginY = safeH / 2 + BUBBLE_H / 2;

    const free: { cx: number; cy: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = pad + c * CELL_W + CELL_W / 2;
        const cy = pad + r * CELL_H + CELL_H / 2;
        if (Math.abs(cx - areaCx) < safeMarginX && Math.abs(cy - areaCy) < safeMarginY) continue;
        let occupied = false;
        for (const id of ids) {
          const p = existing[id];
          if (!p) continue;
          if (Math.abs(cx - p.x) < CELL_W / 2 && Math.abs(cy - p.y) < CELL_H / 2) { occupied = true; break; }
        }
        if (!occupied) free.push({ cx, cy });
      }
    }

    if (free.length === 0) return null;

    const cell = free[Math.floor(Math.random() * free.length)];
    const offX = (Math.random() - 0.5) * 2 * (BUBBLE_REAL_W * 0.25);
    const offY = (Math.random() - 0.5) * 2 * (BUBBLE_REAL_H * 0.25);
    return { x: cell.cx + offX, y: cell.cy + offY };
  };

  const handleBudgetAdd = () => {
    const name = selectedCategory;
    const amount = parseInt(budgetAmount);
    if (!name || !amount || amount <= 0) return;
    if (amount > 999999) return;
    if (getTotalAmount() + amount > 999999) return;
    const area = bubbleAreaRef.current;
    const w = area?.clientWidth || 400;
    const h = area?.clientHeight || 300;
    const pos = tryPlaceBubble(currentPagePositions, w, h);
    const id = Date.now();
    if (pos) {
      setPages(prev => {
        const copy = [...prev];
        copy[currentPage] = { ...copy[currentPage], [id]: pos };
        return copy;
      });
    } else {
      setPages(prev => [...prev, { [id]: { x: w / 4 + Math.random() * w / 2, y: h / 4 + Math.random() * h / 2 } }]);
      setCurrentPage(pages.length);
    }
    setBudgetList([...budgetList, { id, name, amount, note: budgetNote.trim() || undefined }]);
    setBudgetAmount('');
    setBudgetNote('');
  };

  const handleBudgetFillAll = () => {
    const name = selectedCategory;
    const amount = parseInt(budgetAmount);
    if (!name || !amount || amount <= 0) return;
    if (amount > 999999) return;
    const area = bubbleAreaRef.current;
    const w = area?.clientWidth || 400;
    const h = area?.clientHeight || 300;

    const newItems: { id: number; name: string; amount: number; note?: string }[] = [];
    const newPositions: Record<number, { x: number; y: number }> = {};

    let pos = tryPlaceBubble({ ...currentPagePositions, ...newPositions }, w, h);
    let id = Date.now();
    while (pos && getTotalAmount() + amount <= 999999) {
      newItems.push({ id, name, amount, note: budgetNote.trim() || undefined });
      newPositions[id] = pos;
      id++;
      pos = tryPlaceBubble({ ...currentPagePositions, ...newPositions }, w, h);
    }

    if (newItems.length > 0) {
      setPages(prev => {
        const copy = [...prev];
        copy[currentPage] = { ...copy[currentPage], ...newPositions };
        return copy;
      });
      setBudgetList([...budgetList, ...newItems]);
      setBudgetAmount('');
      setBudgetNote('');
    }
  };

  const handleBudgetDelete = (id: number) => {
    setBudgetList(budgetList.filter(b => b.id !== id));
    setPages(prev => {
      const copy = prev.map(p => {
        const n = { ...p };
        delete n[id];
        return n;
      });
      const filtered = copy.filter((p, i) => i === 0 || Object.keys(p).length > 0);
      const removedCount = copy.length - filtered.length;
      if (removedCount > 0) {
        setPageNames(pns => {
          const newNames = [...pns];
          for (let i = copy.length - 1; i >= 0; i--) {
            if (i > 0 && Object.keys(copy[i]).length === 0) {
              newNames.splice(i, 1);
            }
          }
          return newNames.length > 0 ? newNames : ['1'];
        });
        if (currentPage >= filtered.length) {
          setCurrentPage(Math.max(0, filtered.length - 1));
        }
      }
      return filtered;
    });
    if (currentPagePositions[id] && Object.keys(currentPagePositions).length === 1 && currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const getTotalAmount = () => {
    return budgetList.reduce((sum, item) => sum + item.amount, 0);
  };

  const handleBudgetNoteOpen = (itemId: number, e: React.MouseEvent) => {
    const area = bubbleAreaRef.current;
    if (!area) return;
    const areaRect = area.getBoundingClientRect();
    const targetRect = (e.target as HTMLElement).getBoundingClientRect();
    const top = targetRect.bottom - areaRect.top + area.scrollTop + 6;
    const left = targetRect.left + targetRect.width / 2 - areaRect.left + area.scrollLeft;
    const item = budgetList.find(b => b.id === itemId);
    setBudgetNoteText(item?.note || '');
    setBudgetNotePos({ top, left });
    setBudgetNoteId(itemId);
  };

  const handleFieldEditStart = (id: number, field: 'name' | 'amount' | 'note', e: React.MouseEvent) => {
    e.stopPropagation();
    const item = budgetList.find(b => b.id === id);
    if (!item) return;
    setEditingField({ id, field });
    setEditValue(field === 'amount' ? String(item.amount) : (item[field] || ''));
  };

  const handleEditValueChange = (val: string, field?: 'name' | 'note') => {
    if (field && canAddChar(val)) setEditValue(val);
    else if (!field) setEditValue(val);
  };

  const handleFieldEditSave = () => {
    if (!editingField) return;
    const { id, field } = editingField;
    const finalValue = (field === 'name' || field === 'note') && getCharCount(editValue) > 20 
      ? editValue.substring(0, 40) // rough truncate
      : editValue;
    setBudgetList(budgetList.map(b => {
      if (b.id !== id) return b;
      if (field === 'amount') return { ...b, amount: parseInt(finalValue) || 0 };
      return { ...b, [field]: finalValue };
    }));
    setEditingField(null);
  };

  const handleBudgetNoteSave = () => {
    if (budgetNoteId !== null) {
      setBudgetList(budgetList.map(b => b.id === budgetNoteId ? { ...b, note: budgetNoteText } : b));
    }
    setBudgetNoteId(null);
    setBudgetNotePos(null);
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

  const handleAdd = (currentTo?: string, currentEndDate?: string) => {
    const newId = Math.max(...transportList.map((t) => t.id), 0) + 1;
    const inheritDate = currentEndDate || getToday();
    const newItem: TransportItem = {
      id: newId,
      from: currentTo || '',
      to: '',
      note: '',
      noteExpanded: false,
      startDate: inheritDate,
      endDate: inheritDate,
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

  const handleEdit = (id: number, field: 'from' | 'to' | 'note') => {
    setEditingId(id);
    setEditField(field);
  };

  const handleBlur = () => {
    setEditingId(null);
    setEditField(null);
  };

const handleUpdate = (id: number, field: 'from' | 'to' | 'note' | 'startDate' | 'endDate', value: string) => {
    setTransportList(
      transportList.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
  };

  const handleNotePopoverOpen = (itemId: number, e: React.MouseEvent) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const item = transportList.find(t => t.id === itemId);
    setNotePopoverText(item?.note || '');
    setNotePopoverPos({ top: rect.bottom + 8, left: rect.left + rect.width / 2 });
    setNotePopoverItemId(itemId);
  };

  const handleNotePopoverClose = () => {
    setNotePopoverItemId(null);
    setNotePopoverPos(null);
  };

  const handleNotePopoverSave = () => {
    if (notePopoverItemId !== null) {
      setTransportList(
        transportList.map((t) => (t.id === notePopoverItemId ? { ...t, note: notePopoverText } : t))
      );
    }
    handleNotePopoverClose();
  };

  const handleNoteLineDelete = (itemId: number, lineIndex: number) => {
    setTransportList(
      transportList.map((t) => {
        if (t.id !== itemId || !t.note) return t;
        const lines = t.note.split('\n');
        lines.splice(lineIndex, 1);
        return { ...t, note: lines.join('\n') };
      })
    );
  };

  const getToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const stepDate = (itemId: number, field: 'startDate' | 'endDate', delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const item = transportList.find(t => t.id === itemId);
    const otherField = field === 'startDate' ? 'endDate' : 'startDate';
    const current = item?.[field] || getToday();
    const other = item?.[otherField] || getToday();
    const d = new Date(current);
    d.setDate(d.getDate() + delta);
    const newDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (field === 'startDate' && newDate > other) return;
    if (field === 'endDate' && newDate < other) return;
    handleUpdate(itemId, field, newDate);
  };

  const formatDateShort = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
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
      <div className={styles.budgetHeader}>
        <div className={styles.budgetModeToggle}>
          <button
            type="button"
            className={`${styles.budgetModeBtn} ${budgetViewMode === 'bubble' ? styles.budgetModeActive : ''}`}
            onClick={() => setBudgetViewMode('bubble')}
          >气泡</button>
          <button
            type="button"
            className={`${styles.budgetModeBtn} ${budgetViewMode === 'list' ? styles.budgetModeActive : ''}`}
            onClick={() => setBudgetViewMode('list')}
          >列表</button>
        </div>
          {pages.length > 1 && (
            <div className={styles.budgetPageNav}>
              <button
                type="button"
                className={styles.pageNavArrow}
                disabled={currentPage === 0}
                onClick={() => setCurrentPage(currentPage - 1)}
              >◀</button>
              {editingPageName ? (
                <input
                  className={styles.pageNavNameInput}
                  value={pageNames[currentPage] ?? String(currentPage + 1)}
                  onChange={(e) => {
                    setPageNames(pageNames.map((n, i) => i === currentPage ? e.target.value : n));
                  }}
                  onBlur={() => setEditingPageName(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setEditingPageName(false);
                    if (e.key === 'Escape') setEditingPageName(false);
                  }}
                  autoFocus
                />
              ) : (
                <span
                  className={styles.pageNavName}
                  onClick={() => setEditingPageName(true)}
                >第{pageNames[currentPage] ?? currentPage + 1}页</span>
              )}
              <button
                type="button"
                className={styles.pageNavArrow}
                disabled={currentPage >= pages.length - 1}
                onClick={() => setCurrentPage(currentPage + 1)}
              >▶</button>
              <button
                type="button"
                className={styles.pageNavAdd}
                onClick={() => {
                  setPages(prev => [...prev, {}]);
                  setPageNames(prev => [...prev, String(prev.length + 1)]);
                  setCurrentPage(pages.length);
                }}
              >＋</button>
            </div>
          )}
        <div className={styles.budgetTopRight}>
          <select
            className={styles.currencySelect}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className={styles.budgetCustomWrap}>
          {showCustomInput ? (
            <div className={styles.budgetCustomInput}>
              <input
                type="text"
                className={styles.budgetCustomName}
                value={customCategoryName}
                onChange={(e) => setCustomCategoryName(e.target.value)}
                placeholder="新分类名"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customCategoryName.trim()) {
                    setCustomCategories([...customCategories, customCategoryName.trim()]);
                    setCustomCategoryName('');
                    setShowCustomInput(false);
                  }
                }}
              />
              <button
                type="button"
                className={styles.budgetCustomConfirm}
                onClick={() => {
                  if (customCategoryName.trim()) {
                    setCustomCategories([...customCategories, customCategoryName.trim()]);
                    setCustomCategoryName('');
                    setShowCustomInput(false);
                  }
                }}
              >✓</button>
            </div>
          ) : (
            <button type="button" className={styles.budgetCustomBtn} onClick={() => setShowCustomInput(true)}>+ 自定义</button>
          )}
        </div>
        </div>
      </div>

      {budgetViewMode === 'bubble' ? (
        <div className={styles.bubbleArea} ref={bubbleAreaRef}>

          <div className={styles.totalAmount}>{currency}{getTotalAmount()}</div>
          {budgetList.filter(b => currentPagePositions[b.id]).map((item) => {
            const cat = allCategories.find(c => c.name === item.name);
            const color = cat ? cat.color : '#9ca3af';
            const pos = currentPagePositions[item.id];
            const isEditThis = editingField?.id === item.id;
            return (
              <div
                key={item.id}
                className={styles.amountBubble}
                style={{ borderColor: color, left: pos.x - BUBBLE_REAL_W / 2, top: pos.y - BUBBLE_REAL_H / 2 }}
              >
                {isEditThis && editingField?.field === 'amount' ? (
                  <input className={styles.bubbleFieldInput} type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleFieldEditSave} onKeyDown={(e) => { if (e.key === 'Enter') handleFieldEditSave(); if (e.key === 'Escape') setEditingField(null); }} onFocus={(e) => e.target.select()} autoFocus />
                ) : (
                  <div className={styles.bubbleAmount} onDoubleClick={(e) => handleFieldEditStart(item.id, 'amount', e)}>{currency}{item.amount}</div>
                )}
                <div className={styles.bubbleCat} onDoubleClick={(e) => handleFieldEditStart(item.id, 'name', e)}>
                  {isEditThis && editingField?.field === 'name' ? (
                    <input className={styles.bubbleFieldInput} value={editValue} onChange={(e) => { if (canAddChar(e.target.value)) setEditValue(e.target.value); }} onBlur={handleFieldEditSave} onKeyDown={(e) => { if (e.key === 'Enter') handleFieldEditSave(); if (e.key === 'Escape') setEditingField(null); }} onFocus={(e) => e.target.select()} autoFocus />
                  ) : item.name}
                </div>
                <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 4, padding: '2px 8px', borderRadius: 4, background: 'rgba(0,0,0,0.6)', zIndex: 5, opacity: 0, transition: 'opacity 0.15s' }} className="bubble-note-container" onClick={(e) => e.stopPropagation()} onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')} onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}>
                  {isEditThis && editingField?.field === 'note' ? (
                    <textarea ref={noteTextareaRef} className={styles.bubbleFieldTextarea} value={editValue} onChange={(e) => { if (canAddChar(e.target.value)) { setEditValue(e.target.value); adjustTextareaHeight(e.target); } }} onBlur={handleFieldEditSave} onKeyDown={(e) => { if (e.key === 'Escape') setEditingField(null); }} onFocus={(e) => { e.target.select(); adjustTextareaHeight(e.target); }} rows={1} autoFocus />
                  ) : <div style={{ fontSize: 10, color: '#fff', whiteSpace: 'normal', wordBreak: 'break-all', maxHeight: 28, overflow: 'hidden', textAlign: 'center' }}>{item.note || ''}</div>}
                </div>
                <div className={styles.bubbleHoverActions}>
                  <button type="button" className={styles.bubbleDelBtn} onClick={(e) => { e.stopPropagation(); handleBudgetDelete(item.id); }}>×</button>
                </div>
              </div>
            );
          })}
          {Object.keys(currentPagePositions).length === 0 && (
            <div className={styles.budgetEmpty}></div>
          )}
        </div>
      ) : (
        <div className={styles.budgetListWrap}>
          <div className={styles.budgetListHeader}>
            <span>分类</span>
            <span>金额</span>
            <span>备注</span>
            <span></span>
          </div>
          {budgetList.map((item) => {
            const cat = allCategories.find(c => c.name === item.name);
            const color = cat ? cat.color : '#9ca3af';
            return (
              <div key={item.id} className={styles.budgetListRow}>
                <span className={styles.budgetListName} style={{ color }}>● {item.name}</span>
                <input
                  type="number"
                  className={styles.budgetListAmountInput}
                  value={item.amount}
                  onChange={(e) => {
                    const v = parseInt(e.target.value) || 0;
                    setBudgetList(budgetList.map(b => b.id === item.id ? { ...b, amount: v } : b));
                  }}
                />
                <input
                  type="text"
                  className={styles.budgetListNoteInput}
                  value={item.note || ''}
                  onChange={(e) => setBudgetList(budgetList.map(b => b.id === item.id ? { ...b, note: e.target.value } : b))}
                  placeholder="备注"
                />
                <button type="button" className={styles.budgetListDel} onClick={() => handleBudgetDelete(item.id)}>×</button>
              </div>
            );
          })}
          {budgetList.length > 0 && (
            <div className={styles.budgetListTotal}>
              <span>合计</span>
              <span>{currency}{getTotalAmount()}</span>
              <span></span>
              <span></span>
            </div>
          )}
          {budgetList.length === 0 && (
            <div className={styles.budgetEmpty}>暂无数据</div>
          )}
        </div>
      )}

      <div className={styles.budgetBottom}>
        <div className={styles.budgetCatLeft}>
          {allCategories.map(cat => (
            <button
              key={cat.name}
              type="button"
              className={styles.budgetCatBtn}
              style={{
                borderColor: selectedCategory === cat.name ? cat.color : 'rgba(0,0,0,0.06)',
                color: selectedCategory === cat.name ? cat.color : '#6b7280',
                background: selectedCategory === cat.name ? `${cat.color}10` : '#fff',
              }}
              onClick={() => handleCategorySelect(cat.name)}
            >{cat.name}</button>
          ))}
        </div>
        <div className={styles.budgetInputGroup}>
            <input
              type="number"
              className={styles.budgetAmountInput}
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
              placeholder="金额"
              style={selectedCategory ? { borderColor: allCategories.find(c => c.name === selectedCategory)?.color } : {}}
              onKeyDown={(e) => e.key === 'Enter' && handleBudgetAdd()}
            />
            <input
              type="text"
              className={styles.budgetNoteInput}
              value={budgetNote}
              onChange={(e) => handleNoteChange(e.target.value)}
              placeholder="备注"
              onKeyDown={(e) => e.key === 'Enter' && handleBudgetAdd()}
            />
            <button type="button" className={styles.budgetAddBtn} onClick={handleBudgetAdd}>添加</button>
            <button type="button" className={styles.budgetAddBtn} onClick={handleBudgetFillAll} style={{ background: '#22c55e' }}>填满所有</button>
          </div>
        </div>
      </div>
  );

  const renderTransportList = () => {
    const stripeColors = ['#93c5fd', '#c4b5fd', '#5eead4', '#fde68a'];
    const isAnyEditing = editingId !== null;
    return (
    <div className={styles.transportList}>
      {transportList.map((item, idx) => (
        <div
          key={item.id}
          className={`${styles.transportRow} ${isAnyEditing && editingId === item.id ? styles.transportRowEditing : ''}`}
          style={{ borderLeftColor: stripeColors[idx % stripeColors.length] }}
        >
          <div className={styles.transportMainRow}>
            <span
              className={`${styles.transportItem} ${editingId === item.id && editField === 'from' ? styles.transportItemEditing : styles.transportItemEditable}`}
              onClick={() => handleEdit(item.id, 'from')}
            >
              <div className={styles.transportDateWrap} onClick={(e) => e.stopPropagation()}>
                <div className={`${styles.transportDateStepper} ${styles.transportDateStepUp}`}>
                  <button type="button" className={styles.transportDateStepBtn} onClick={(e) => stepDate(item.id, 'startDate', 1, e)}>+</button>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
                  <span className={styles.transportDateInline}>
                    {formatDateShort(item.startDate)}
                  </span>
                  <input
                    type="date"
                    className={styles.transportDateHidden}
                    value={item.startDate || getToday()}
                    onChange={(e) => handleUpdate(item.id, 'startDate', e.target.value)}
                  />
                </label>
                <div className={`${styles.transportDateStepper} ${styles.transportDateStepDown}`}>
                  <button type="button" className={styles.transportDateStepBtn} onClick={(e) => stepDate(item.id, 'startDate', -1, e)}>−</button>
                </div>
              </div>
              {editingId === item.id && editField === 'from' ? (
                <input
                  ref={inputRef}
                  className={styles.transportInput}
                  value={item.from}
                  onChange={(e) => handleUpdate(item.id, 'from', e.target.value)}
                  onBlur={handleBlur}
                  placeholder="起点"
                  style={{ flex: 1, minWidth: 0 }}
                />
              ) : (
                <span className={`${styles.transportItemText} ${item.from ? styles.filled : styles.placeholder}`}>
                  {item.from || '起点'}
                </span>
              )}
            </span>
            <div className={styles.transportArrowCol}>
              <div className={styles.arrowLine}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
            <span
              className={`${styles.transportItem} ${editingId === item.id && editField === 'to' ? styles.transportItemEditing : styles.transportItemEditable}`}
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
                  style={{ flex: 1, minWidth: 0 }}
                />
              ) : (
                <span className={`${styles.transportItemText} ${item.to ? styles.filled : styles.placeholder}`}>
                  {item.to || '终点'}
                </span>
              )}
              <div className={styles.transportDateWrap} onClick={(e) => e.stopPropagation()}>
                <div className={`${styles.transportDateStepper} ${styles.transportDateStepUp}`}>
                  <button type="button" className={styles.transportDateStepBtn} onClick={(e) => stepDate(item.id, 'endDate', 1, e)}>+</button>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
                  <span className={styles.transportDateInline}>
                    {formatDateShort(item.endDate)}
                  </span>
                  <input
                    type="date"
                    className={styles.transportDateHidden}
                    value={item.endDate || getToday()}
                    onChange={(e) => handleUpdate(item.id, 'endDate', e.target.value)}
                  />
                </label>
                <div className={`${styles.transportDateStepper} ${styles.transportDateStepDown}`}>
                  <button type="button" className={styles.transportDateStepBtn} onClick={(e) => stepDate(item.id, 'endDate', -1, e)}>−</button>
                </div>
              </div>
            </span>
            <button
              type="button"
              className={styles.transportAdd}
              onClick={() => handleAdd(item.to, item.endDate)}
              title="添加下一段"
            >
              +
            </button>
            <button
              type="button"
              className={`${styles.transportNoteBtn} ${item.note ? styles.transportNoteBtnHasNote : ''}`}
              onClick={(e) => handleNotePopoverOpen(item.id, e)}
              title={item.note || '添加备注'}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>
            <button
              type="button"
              className={styles.transportDelete}
              tabIndex={0}
              onClick={() => handleDelete(item.id)}
              title="删除"
            >
              −
            </button>
          </div>
          {item.note && (
            <div className={styles.transportNoteDisplay}>
              {item.note.split('\n').map((line, li) => (
                <div key={li} className={styles.transportNoteLine}>
                  <span className={styles.transportNoteLineText}>{line}</span>
                  <button
                    type="button"
                    className={styles.transportNoteLineDel}
                    onClick={() => handleNoteLineDelete(item.id, li)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

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
      {notePopoverItemId !== null && notePopoverPos && (
        <div
          className={styles.transportNotePopover}
          style={{
            top: notePopoverPos.top,
            left: notePopoverPos.left,
            transform: 'translateX(-50%)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <textarea
            className={styles.transportNotePopoverTextarea}
            value={notePopoverText}
            onChange={(e) => setNotePopoverText(e.target.value)}
            placeholder="输入备注..."
            autoFocus
          />
          <div className={styles.transportNotePopoverActions}>
            <button type="button" className={styles.transportNotePopoverCancel} onClick={handleNotePopoverClose}>取消</button>
            <button type="button" className={styles.transportNotePopoverSave} onClick={handleNotePopoverSave}>保存</button>
          </div>
        </div>
      )}
      {budgetNoteId !== null && budgetNotePos && (
        <div
          className={styles.transportNotePopover}
          style={{ top: budgetNotePos.top, left: budgetNotePos.left, transform: 'translateX(-50%)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <textarea
            className={styles.transportNotePopoverTextarea}
            value={budgetNoteText}
            onChange={(e) => { if (canAddChar(e.target.value)) setBudgetNoteText(e.target.value); }}
            placeholder="备注..."
            autoFocus
          />
          <div className={styles.transportNotePopoverActions}>
            <button type="button" className={styles.transportNotePopoverCancel} onClick={() => { setBudgetNoteId(null); setBudgetNotePos(null); }}>取消</button>
            <button type="button" className={styles.transportNotePopoverSave} onClick={handleBudgetNoteSave}>保存</button>
          </div>
        </div>
      )}
    </div>
  );
}
