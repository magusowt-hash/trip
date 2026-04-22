'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '../layout';

export default function ListsPage() {
  const router = useRouter();
  const [lists, setLists] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ name: '', cover_image: '', description: '' });
  const { token } = useAdminAuth();

  useEffect(() => {
    loadLists();
  }, [token]);

  const loadLists = () => {
    fetch('/api/admin/lists', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setLists(data.list || []));
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定删除该榜单？')) return;
    await fetch(`/api/admin/lists?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    loadLists();
  };

  const handleSubmit = async () => {
    if (!formData.name) {
      alert('请输入名称');
      return;
    }
    await fetch('/api/admin/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(formData),
    });
    setShowModal(false);
    setFormData({ name: '', cover_image: '', description: '' });
    loadLists();
  };

  const openAdd = () => {
    setFormData({ name: '', cover_image: '', description: '' });
    setShowModal(true);
  };

  return (
    <div className="page">
      <div className="header">
        <h1>榜单管理</h1>
        <button className="add-btn" onClick={openAdd}>+ 添加榜单</button>
      </div>

      {lists.length === 0 ? (
        <div className="empty">
          <p>暂无榜单</p>
          <button onClick={openAdd}>+ 添加第一个榜单</button>
        </div>
      ) : (
        <div className="grid">
          {lists.map(item => (
            <div key={item.id} className="card">
              <div 
                className="card-cover" 
                style={{ backgroundImage: item.cover_image ? `url(${item.cover_image})` : undefined }}
                onClick={() => router.push(`/management/lists/${item.id}`)}
              >
                {!item.cover_image && <span className="placeholder">点击设置封面</span>}
              </div>
              <div className="card-body">
                <h3 className="card-title">{item.name}</h3>
                {item.description && <p className="card-desc">{item.description}</p>}
              </div>
              <div className="card-actions">
                <button onClick={() => router.push(`/management/lists/${item.id}`)}>管理数据</button>
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
              <h2>添加榜单</h2>
              <button onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label>榜单名称 *</label>
                <input 
                  type="text" 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div className="form-field">
                <label>描述</label>
                <textarea 
                  value={formData.description} 
                  onChange={e => setFormData({...formData, description: e.target.value})}
                />
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
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .header h1 { margin: 0; font-size: 20px; }
        .add-btn { padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .empty { text-align: center; padding: 60px; color: #6b7280; }
        .empty button { margin-top: 12px; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; }
        
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
        .card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .card-cover { height: 160px; background-size: cover; background-position: center; background-color: #f3f4f6; position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .card-cover .placeholder { color: #9ca3af; font-size: 14px; }
        
        .card-body { padding: 12px; }
        .card-title { margin: 0 0 4px; font-size: 15px; font-weight: 600; }
        .card-desc { margin: 0; font-size: 13px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        
        .card-actions { display: flex; border-top: 1px solid #f3f4f6; }
        .card-actions button { flex: 1; padding: 10px; font-size: 13px; border: none; background: white; cursor: pointer; border-right: 1px solid #f3f4f6; }
        .card-actions button:last-child { border-right: none; }
        .card-actions button.danger { color: #ef4444; }
        
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal { background: white; border-radius: 12px; width: 90%; max-width: 400px; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid #e5e7eb; }
        .modal-header h2 { margin: 0; font-size: 18px; }
        .modal-header button { background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280; }
        .modal-body { padding: 16px; }
        .form-field { margin-bottom: 12px; }
        .form-field label { display: block; margin-bottom: 4px; font-size: 13px; font-weight: 500; }
        .form-field input, .form-field textarea { width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
        .modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 16px; border-top: 1px solid #e5e7eb; }
        .modal-footer button { padding: 8px 16px; border: 1px solid #d1d5db; background: white; border-radius: 6px; cursor: pointer; }
        .modal-footer button.primary { background: #3b82f6; color: white; border: none; }
      `}</style>
    </div>
  );
}
