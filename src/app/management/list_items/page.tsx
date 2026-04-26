'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from '../admin-auth';

export default function ListItemsPage() {
  const [lists, setLists] = useState<any[]>([]);
  const [currentListId, setCurrentListId] = useState<number>(0);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [formData, setFormData] = useState({ title: '', cover_image: '', description: '', address: '', lng: '', lat: '' });
  const { token } = useAdminAuth();

  useEffect(() => {
    fetch('/api/admin/lists', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        if (data.list && data.list.length > 0) {
          setLists(data.list);
          setCurrentListId(data.list[0].id);
        }
      });
  }, [token]);

  useEffect(() => {
    if (currentListId) {
      setLoading(true);
      fetch(`/api/admin/list_items?list_id=${currentListId}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => {
          setItems(data.list || []);
          setLoading(false);
        });
    }
  }, [currentListId, token]);

  const handleGeocode = async (item: any) => {
    const address = item.address || item.title;
    if (!address) {
      alert('请先填写地址或标题');
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
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, lng: data.lng, lat: data.lat } : i));
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
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleSubmit = async () => {
    if (!formData.title) {
      alert('请输入标题');
      return;
    }
    const method = editItem ? 'PUT' : 'POST';
    const url = editItem ? `/api/admin/list_items?id=${editItem.id}` : '/api/admin/list_items';
    const body: any = { ...formData, list_id: currentListId };
    if (editItem) delete body.list_id;

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    setShowModal(false);
    setEditItem(null);
    setFormData({ title: '', cover_image: '', description: '', address: '', lng: '', lat: '' });
    const res = await fetch(`/api/admin/list_items?list_id=${currentListId}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setItems(data.list || []);
  };

  const openAdd = () => {
    setEditItem(null);
    setFormData({ title: '', cover_image: '', description: '', address: '', lng: '', lat: '' });
    setShowModal(true);
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
    setShowModal(true);
  };

  return (
    <div className="page">
      <div className="header">
        <div className="tabs">
          {lists.map(list => (
            <button 
              key={list.id}
              className={`tab ${currentListId === list.id ? 'active' : ''}`}
              onClick={() => setCurrentListId(list.id)}
            >
              {list.name}
            </button>
          ))}
        </div>
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

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editItem ? '编辑' : '添加'}数据</h2>
              <button onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label>图片URL *</label>
                <input type="text" value={formData.cover_image} onChange={e => setFormData({...formData, cover_image: e.target.value})} placeholder="https://..." />
              </div>
              <div className="form-field">
                <label>标题 *</label>
                <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
              </div>
              <div className="form-field">
                <label>描述</label>
                <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
              </div>
              <div className="form-field">
                <label>地址</label>
                <input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
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
              <button onClick={() => setShowModal(false)}>取消</button>
              <button className="primary" onClick={handleSubmit}>保存</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .page { padding: 20px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
        .tabs { display: flex; gap: 8px; flex-wrap: wrap; }
        .tab { padding: 8px 16px; border: 1px solid #d1d5db; background: white; border-radius: 4px; cursor: pointer; }
        .tab.active { background: #3b82f6; color: white; border-color: #3b82f6; }
        .add-btn { padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .loading, .empty { text-align: center; padding: 60px; color: #6b7280; }
        .empty button { margin-top: 12px; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; }
        
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
        .card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .card-cover { height: 140px; background-size: cover; background-position: center; background-color: #f3f4f6; position: relative; display: flex; align-items: center; justify-content: center; }
        .card-cover .placeholder { color: #9ca3af; font-size: 14px; }
        .card-cover .coord-badge { position: absolute; top: 8px; right: 8px; background: #10b981; color: white; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; }
        .card-body { padding: 10px; }
        .card-title { margin: 0 0 4px; font-size: 14px; font-weight: 600; }
        .card-desc { margin: 0; font-size: 12px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .card-actions { display: flex; border-top: 1px solid #f3f4f6; }
        .card-actions button { flex: 1; padding: 8px; font-size: 12px; border: none; background: white; cursor: pointer; border-right: 1px solid #f3f4f6; }
        .card-actions button:last-child { border-right: none; }
        .card-actions button.danger { color: #ef4444; }
        
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal { background: white; border-radius: 12px; width: 90%; max-width: 450px; max-height: 90vh; overflow: auto; }
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