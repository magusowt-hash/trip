'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from '../admin-auth';

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

  if (loading) return <div style={{ padding: 20 }}>加载中...</div>;

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>行李清单管理</h2>
        <button
          onClick={() => { setEditCat(null); setCatName(''); setShowCatModal(true); }}
          style={{ padding: '8px 16px', background: '#007aff', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
        >
          + 添加分类
        </button>
      </div>

      {categories.map((cat) => (
        <div key={cat.id} style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #eee' }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>{cat.name}</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setEditCat(cat); setCatName(cat.name); setShowCatModal(true); }}
                style={{ padding: '4px 12px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 }}
              >编辑</button>
              <button
                onClick={() => handleDeleteCategory(cat.id)}
                style={{ padding: '4px 12px', border: '1px solid #fca5a5', borderRadius: 6, background: '#fff', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}
              >删除</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {cat.templates.map((tpl) => (
              <div key={tpl.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#f5f5f5', borderRadius: 20, fontSize: 13 }}>
                <span>{tpl.name}</span>
                <button
                  onClick={() => { setEditTpl(tpl); setTplName(tpl.name); setTplCatId(cat.id); setShowTplModal(true); }}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 12, padding: 0 }}
                >✎</button>
                <button
                  onClick={() => handleDeleteTemplate(tpl.id)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14, padding: 0 }}
                >×</button>
              </div>
            ))}
            <button
              onClick={() => { setEditTpl(null); setTplName(''); setTplCatId(cat.id); setShowTplModal(true); }}
              style={{ padding: '6px 12px', border: '1px dashed #ccc', borderRadius: 20, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#9ca3af' }}
            >
              + 添加物品
            </button>
          </div>
        </div>
      ))}

      {categories.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>暂无分类，点击上方按钮添加</div>
      )}

      {showCatModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: 320 }}>
            <h3 style={{ margin: '0 0 16px' }}>{editCat ? '编辑分类' : '添加分类'}</h3>
            <input
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="分类名称"
              autoFocus
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowCatModal(false); setEditCat(null); }} style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>取消</button>
              <button onClick={handleSaveCategory} style={{ padding: '8px 16px', border: 'none', borderRadius: 8, background: '#007aff', color: '#fff', cursor: 'pointer' }}>保存</button>
            </div>
          </div>
        </div>
      )}

      {showTplModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: 320 }}>
            <h3 style={{ margin: '0 0 16px' }}>{editTpl ? '编辑物品' : '添加物品'}</h3>
            <input
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder="物品名称"
              autoFocus
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowTplModal(false); setEditTpl(null); }} style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>取消</button>
              <button onClick={handleSaveTemplate} style={{ padding: '8px 16px', border: 'none', borderRadius: 8, background: '#007aff', color: '#fff', cursor: 'pointer' }}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
