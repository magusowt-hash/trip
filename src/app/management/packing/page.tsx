'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from '../admin-auth';
import styles from './page.module.css';

interface Category {
  id: number;
  name: string;
  order_num: number;
  templates: { id: number; name: string; order_num: number }[];
}

export default function PackingAdminPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const { token } = useAdminAuth();

  const [showCatModal, setShowCatModal] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');

  const [showTplModal, setShowTplModal] = useState(false);
  const [tplCatId, setTplCatId] = useState<number>(0);
  const [editTpl, setEditTpl] = useState<{ id: number; name: string } | null>(null);
  const [tplName, setTplName] = useState('');

  useEffect(() => { if (token) loadData(); }, [token]);

  const loadData = async () => {
    const res = await fetch('/api/admin/packing', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.categories) setCategories(data.categories);
    setLoading(false);
  };

  const handleSaveCategory = async () => {
    const body = { type: 'category', name: catName, ...(editCat ? { id: editCat.id } : {}), order_num: 0 };
    await fetch('/api/admin/packing', {
      method: editCat ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    setShowCatModal(false); setEditCat(null); setCatName(''); loadData();
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm('确定删除？')) return;
    await fetch(`/api/admin/packing?id=${id}&type=category`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    loadData();
  };

  const handleSaveTemplate = async () => {
    const body = { type: 'template', name: tplName, category_id: tplCatId, ...(editTpl ? { id: editTpl.id } : {}), order_num: 0 };
    await fetch('/api/admin/packing', {
      method: editTpl ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    setShowTplModal(false); setEditTpl(null); setTplName(''); loadData();
  };

  const handleDeleteTemplate = async (id: number) => {
    if (!confirm('确定删除？')) return;
    await fetch(`/api/admin/packing?id=${id}&type=template`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    loadData();
  };

  if (loading) return <div className={styles.loading}>加载中...</div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.headerTitle}>行李清单管理</h2>
          <p className={styles.headerDescription}>维护分类与物品模板，供前台行李清单功能复用。</p>
        </div>
        <button
          onClick={() => { setEditCat(null); setCatName(''); setShowCatModal(true); }}
          className={styles.primaryButton}
        >
          + 添加分类
        </button>
      </div>

      <div className={styles.categories}>
        {categories.map((cat) => (
          <div key={cat.id} className={styles.categoryCard}>
            <div className={styles.categoryHeader}>
              <h3 className={styles.categoryTitle}>{cat.name}</h3>
              <div className={styles.categoryActions}>
                <button
                  onClick={() => { setEditCat(cat); setCatName(cat.name); setShowCatModal(true); }}
                  className={styles.secondaryButton}
                >编辑</button>
                <button
                  onClick={() => handleDeleteCategory(cat.id)}
                  className={styles.dangerButton}
                >删除</button>
              </div>
            </div>
            <div className={styles.templateList}>
              {cat.templates.map((tpl) => (
                <div key={tpl.id} className={styles.templateChip}>
                  <span className={styles.templateName}>{tpl.name}</span>
                  <button
                    onClick={() => { setEditTpl(tpl); setTplName(tpl.name); setTplCatId(cat.id); setShowTplModal(true); }}
                    className={`${styles.chipAction} ${styles.chipEdit}`}
                  >编辑</button>
                  <button
                    onClick={() => handleDeleteTemplate(tpl.id)}
                    className={`${styles.chipAction} ${styles.chipDelete}`}
                  >删除</button>
                </div>
              ))}
              <button
                onClick={() => { setEditTpl(null); setTplName(''); setTplCatId(cat.id); setShowTplModal(true); }}
                className={styles.ghostButton}
              >
                + 添加物品
              </button>
            </div>
          </div>
        ))}
      </div>

      {categories.length === 0 && (
        <div className={styles.empty}>暂无分类，点击上方按钮添加</div>
      )}

      {showCatModal && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalTitle}>{editCat ? '编辑分类' : '添加分类'}</h3>
            <input
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="分类名称"
              autoFocus
              className={styles.input}
            />
            <div className={styles.modalActions}>
              <button onClick={() => { setShowCatModal(false); setEditCat(null); }} className={styles.secondaryButton}>取消</button>
              <button onClick={handleSaveCategory} className={styles.primaryButton}>保存</button>
            </div>
          </div>
        </div>
      )}

      {showTplModal && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalTitle}>{editTpl ? '编辑物品' : '添加物品'}</h3>
            <input
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder="物品名称"
              autoFocus
              className={styles.input}
            />
            <div className={styles.modalActions}>
              <button onClick={() => { setShowTplModal(false); setEditTpl(null); }} className={styles.secondaryButton}>取消</button>
              <button onClick={handleSaveTemplate} className={styles.primaryButton}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
