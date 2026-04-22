'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from '../layout';

const AMAP_KEY = 'fbf5d9a8e346f93257eb7c5ab4d32034';

export default function ListItemsPage() {
  const [lists, setLists] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [formData, setFormData] = useState({ title: '', cover_image: '', description: '', address: '', lng: '', lat: '' });
  const { token } = useAdminAuth();

  useEffect(() => {
    fetch('/api/admin/lists', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        if (data.list && data.list.length > 0) {
          setLists(data.list);
          loadItems(data.list[0].id);
        }
      });
  }, [token]);

  const loadItems = (listId: number) => {
    setLoading(true);
    fetch(`/api/admin/list_items?list_id=${listId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        setItems(data.list || []);
        setLoading(false);
      });
  };

  const handleGeocode = async (item: any) => {
    const address = item.address || item.title;
    if (!address) {
      alert('请先填写地址');
      return;
    }
    try {
      const res = await fetch(`${window.location.origin}/api/admin/list_items?address=${encodeURIComponent(address)}`, {
        headers: { Authorization: `Bearer ${token}` },
        method: 'PATCH',
      });
      const data = await res.json();
      if (data.success && data.lng) {
        await fetch(`/api/admin/list_items?id=${item.id}`, {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          method: 'PUT',
          body: JSON.stringify({ lng: data.lng, lat: data.lat }),
        });
        loadItems(lists.find((l: any) => l.id === item.list_id)?.id || lists[0].id);
      } else {
        alert(data.error || '未找到坐标');
      }
    } catch (e: any) {
      alert('获取坐标失败: ' + e.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定删除？')) return;
    await fetch(`/api/admin/list_items?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    loadItems(lists[0].id);
  };

  const handleSubmit = async () => {
    if (!formData.title) {
      alert('请输入标题');
      return;
    }
    const method = editItem ? 'PUT' : 'POST';
    const url = editItem ? `/api/admin/list_items?id=${editItem.id}` : '/api/admin/list_items';
    const body: any = { ...formData, list_id: lists[0].id, status: 1 };
    if (editItem) delete body.list_id;

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    setShowAddModal(false);
    setEditItem(null);
    setFormData({ title: '', cover_image: '', description: '', address: '', lng: '', lat: '' });
    loadItems(lists[0].id);
  };

  const openAdd = () => {
    setEditItem(null);
    setFormData({ title: '', cover_image: '', description: '', address: '', lng: '', lat: '' });
    setShowAddModal(true);
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setFormData({
      title: item.title || '',
      cover_image: item.cover_image || '',
      description: item.description || '',
      address: item.address || '',
      lng: item.lng || '',
      lat: item.lat || '',
    });
    setShowAddModal(true);
  };

  return (
    <div className="page">
      <div className="header">
        <h1>榜单管理 - {lists[0]?.name || '数据'}</h1>
        <button className="add-btn" onClick={openAdd}>+ 添加</button>
      </div>
      
      {loading ? (
        <div className="loading">加载中...</div>
      ) : items.length === 0 ? (
        <div className="empty">
          <p>暂无数据</p>
          <button onClick={openAdd}>+ 添加第一个</button>
        </div>
      ) : (
        <div className="grid">
          {items.map(item => (
            <div key={item.id} className="card">
              <div 
                className="card-cover" 
                style={{ backgroundImage: item.cover_image ? `url(${item.cover_image})` : undefined }}
              >
                {!item.cover_image && <span className="placeholder">添加封面图</span>}
                {item.lng && item.lat && <span className="coord-badge">✓</span>}
              </div>
              <div className="card-body">
                <h3 className="card-title">{item.title}</h3>
                {item.description && <p className="card-desc">{item.description}</p>}
              </div>
              <div className="card-actions">
                <button onClick={() => openEdit(item)}>编辑</button>
                <button onClick={() => handleGeocode(item)}>坐标</button>
                <button className="danger" onClick={() => handleDelete(item.id)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editItem ? '编辑' : '添加'}数据</h2>
              <button onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label>图片URL *</label>
                <input 
                  type="text" 
                  value={formData.cover_image} 
                  onChange={e => setFormData({...formData, cover_image: e.target.value})}
                  placeholder="https://..."
                />
              </div>
              <div className="form-field">
                <label>标题 *</label>
                <input 
                  type="text" 
                  value={formData.title} 
                  onChange={e => setFormData({...formData, title: e.target.value})}
                />
              </div>
              <div className="form-field">
                <label>描述</label>
                <textarea 
                  value={formData.description} 
                  onChange={e => setFormData({...formData, description: e.target.value})}
                />
              </div>
              <div className="form-field">
                <label>地址</label>
                <input 
                  type="text" 
                  value={formData.address} 
                  onChange={e => setFormData({...formData, address: e.target.value})}
                />
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>经度</label>
                  <input type="text" value={formData.lng} onChange={e => setFormData({...formData, lng: e.target.value})} />
                </div>
                <div className="form-field">
                  <label>纬度</label>
                  <input type="text" value={formData.lat} onChange={e => setFormData({...formData, lat: e.target.value})} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowAddModal(false)}>取消</button>
              <button className="primary" onClick={handleSubmit}>保存</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .page { padding: 20px; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .header h1 { margin: 0; font-size: 20px; }
        .add-btn { padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .loading, .empty { text-align: center; padding: 60px; color: #6b7280; }
        .empty button { margin-top: 12px; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; }
        
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
        .card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .card-cover { height: 160px; background-size: cover; background-position: center; background-color: #f3f4f6; position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .card-cover .placeholder { color: #9ca3af; font-size: 14px; }
        .card-cover .coord-badge { position: absolute; top: 8px; right: 8px; background: #10b981; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; }
        
        .card-body { padding: 12px; }
        .card-title { margin: 0 0 4px; font-size: 15px; font-weight: 600; }
        .card-desc { margin: 0; font-size: 13px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        
        .card-actions { display: flex; border-top: 1px solid #f3f4f6; }
        .card-actions button { flex: 1; padding: 10px; font-size: 13px; border: none; background: white; cursor: pointer; border-right: 1px solid #f3f4f6; }
        .card-actions button:last-child { border-right: none; }
        .card-actions button:hover { background: #f9fafb; }
        .card-actions button.danger { color: #ef4444; }
        
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal { background: white; border-radius: 12px; width: 90%; max-width: 480px; max-height: 90vh; overflow: auto; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid #e5e7eb; }
        .modal-header h2 { margin: 0; font-size: 18px; }
        .modal-header button { background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280; }
        .modal-body { padding: 16px; }
        .form-field { margin-bottom: 12px; }
        .form-field label { display: block; margin-bottom: 4px; font-size: 13px; font-weight: 500; }
        .form-field input, .form-field textarea { width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
        .form-field textarea { min-height: 60px; }
        .form-row { display: flex; gap: 12px; }
        .form-row .form-field { flex: 1; }
        .modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 16px; border-top: 1px solid #e5e7eb; }
        .modal-footer button { padding: 8px 16px; border: 1px solid #d1d5db; background: white; border-radius: 6px; cursor: pointer; }
        .modal-footer button.primary { background: #3b82f6; color: white; border: none; }
      `}</style>
    </div>
  );
}