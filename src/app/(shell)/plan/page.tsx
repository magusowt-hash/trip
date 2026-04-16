'use client';

import { useState, useRef, useEffect } from 'react';
import { DEMO_EXISTING_PLANS, formatPlanDateLine, groupPlansByYearMonth } from './planData';
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

function PlanDraftPanel() {
  return (
    <section className={styles.draftCol} aria-label="制定计划">
      <h1 className={styles.draftTitle}>制定计划</h1>
      <p className={styles.draftHint}>左侧为规划区，后续可在此编辑行程、日期与同行人。当前仅占位。</p>
      <div className={styles.draftBlank} />
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
  const [selectedPlan, setSelectedPlan] = useState<{ id: number; name: string; items: any[] } | null>(null);
  const [userPlans, setUserPlans] = useState<{ id: number; name: string }[]>([]);
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

  const handleViewPlan = (plan: { id: number; name: string }) => {
    fetch(`/api/plans/${plan.id}`)
      .then((res) => res.json())
      .then((data) => {
        setSelectedPlan({ ...plan, items: data.items || [] });
        setShowViewModal(true);
      })
      .catch((err) => console.error('Failed to fetch plan details:', err));
  };

  const handleEditFromView = (plan: { id: number; name: string; items: any[] }) => {
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
              <p className={styles.planTitle}>{plan.name}</p>
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
  plan: { id: number; name: string; items: any[] };
  onClose: () => void;
  onEdit: () => void;
}

function PlanViewModal({ plan, onClose, onEdit }: PlanViewModalProps) {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalRegion1}>
          <div className={styles.planInfo}>
            <span className={styles.planName}>{plan.name}</span>
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

  const toggleNoteExpand = (id: number) => {
    setTransportList(
      transportList.map((t) => (t.id === id ? { ...t, noteExpanded: !t.noteExpanded } : t))
    );
  };

  const handleEdit = (id: number, field: 'from' | 'to' | 'note') => {
    setEditingId(id);
    setEditField(field);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleBlur = () => {
    setEditingId(null);
    setEditField(null);
  };

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
            {activeTab === 0 && (
              <div className={styles.dateRangePicker}>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  placeholder="开始日期"
                />
                <span className={styles.dateSeparator}>→</span>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  placeholder="结束日期"
                />
              </div>
            )}
            {activeTab === 0 ? renderTransportList() : activeTab > 0 ? (
              <div className={styles.tabContent}>{TABS[activeTab]} 内容</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
