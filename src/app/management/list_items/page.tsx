'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from '../layout';
import { AdminTable } from '../AdminTable';

const AMAP_KEY = 'fbf5d9a8e346f93257eb7c5ab4d32034';

export default function ListItemsPage() {
  const [lists, setLists] = useState<any[]>([]);
  const [currentListId, setCurrentListId] = useState<number | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { token } = useAdminAuth();

  useEffect(() => {
    fetch('/api/admin/lists', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        if (data.list) {
          setLists(data.list);
          if (data.list.length > 0) {
            setCurrentListId(data.list[0].id);
          }
        }
      });
  }, [token]);

  useEffect(() => {
    if (currentListId) {
      setLoading(true);
      fetch(`/api/admin/list_items?list_id=${currentListId}`, { headers: { Authorization: `Bearer ${token}` } })
          setLoading(false);
        });
    }
  }, [currentListId, token]);

  const handleGeocode = async (item: any) => {
    const address = item.address || item.title;
    if (!address) {
      alert('请填写地址');
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
          headers: { 
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}` 
          },
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

  const handleAdd = () => {
    const title = prompt('请输入标题');
    if (!title) return;
    fetch('/api/admin/list_items', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify({ list_id: currentListId, title, status: 1 }),
    }).then(res => res.json()).then(data => {
      if (data.success) {
        setItems(prev => [{ id: data.id, list_id: currentListId, title, status: 1 }, ...prev]);
      }
    });
  };

  const handleEdit = (item: any) => {
    const newTitle = prompt('请输入标题', item.title);
    const newCover = prompt('请输入封面图片URL', item.cover_image || '');
    const newDesc = prompt('请输入描述', item.description || '');
    const newAddress = prompt('请输入地址', item.address || '');
    const newLng = prompt('请输入经度', item.lng || '');
    const newLat = prompt('请输入纬度', item.lat || '');
    
    fetch(`/api/admin/list_items?id=${item.id}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify({ 
        title: newTitle,
        cover_image: newCover,
        description: newDesc,
        address: newAddress,
        lng: newLng,
        lat: newLat,
      }),
    }).then(() => {
      setItems(prev => prev.map(i => i.id === item.id ? {
        ...i,
        title: newTitle,
        cover_image: newCover,
        description: newDesc,
        address: newAddress,
        lng: newLng,
        lat: newLat,
      } : i));
    });
  };

  return (
    <div className="page">
      <div className="header">
        <h1>榜单管理</h1>
      </div>
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
      <div className="toolbar">
        <button onClick={handleAdd}>+ 添加</button>
      </div>
      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <div className="grid">
          {items.map(item => (
            <div key={item.id} className="card">
              <div className="card-cover" style={{ backgroundImage: item.cover_image ? `url(${item.cover_image})` : undefined }}>
                {!item.cover_image && <span className="placeholder">无封面</span>}
              </div>
              <div className="card-body">
                <h3 className="card-title">{item.title}</h3>
                {item.description && <p className="card-desc">{item.description}</p>}
                <p className="card-address">{item.address || '无地址'}</p>
                <p className="card-coords">{item.lng && item.lat ? `${item.lng}, ${item.lat}` : '无坐标'}</p>
              </div>
              <div className="card-actions">
                <button onClick={() => handleGeocode(item)}>获取坐标</button>
                <button onClick={() => handleEdit(item)}>编辑</button>
                <button className="danger" onClick={() => handleDelete(item.id)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <style>{`
        .page { padding: 20px; }
        .header { margin-bottom: 20px; }
        .header h1 { margin: 0; font-size: 20px; }
        .tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
        .tab { padding: 8px 16px; border: 1px solid #d1d5db; background: white; border-radius: 4px; cursor: pointer; }
        .tab.active { background: #3b82f6; color: white; border-color: #3b82f6; }
        .toolbar { margin-bottom: 16px; }
        .toolbar button { padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .loading { text-align: center; padding: 40px; color: #6b7280; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
        .card { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .card-cover { height: 140px; background-size: cover; background-position: center; background-color: #f3f4f6; display: flex; align-items: center; justify-content: center; }
        .card-cover .placeholder { color: #9ca3af; font-size: 14px; }
        .card-body { padding: 12px; }
        .card-title { margin: 0 0 4px; font-size: 15px; font-weight: 600; }
        .card-desc { margin: 0 0 4px; font-size: 13px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .card-address { margin: 0 0 2px; font-size: 12px; color: #9ca3af; }
        .card-coords { margin: 0; font-size: 11px; color: #d1d5db; }
        .card-actions { display: flex; gap: 4px; padding: 8px 12px; border-top: 1px solid #f3f4f6; }
        .card-actions button { flex: 1; padding: 4px 8px; font-size: 12px; border: 1px solid #d1d5db; background: white; border-radius: 4px; cursor: pointer; }
        .card-actions button.danger { color: #ef4444; border-color: #fecaca; }
      `}</style>
    </div>
  );
}