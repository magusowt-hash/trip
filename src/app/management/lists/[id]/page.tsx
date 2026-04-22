'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAdminAuth } from '../layout';

const AMAP_KEY = 'fbf5d9a8e346f93257eb7c5ab4d32034';

export default function ListDetailPage() {
  const router = useRouter();
  const params = useParams();
  const listId = Number(params.id);
  const [list, setList] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { token } = useAdminAuth();

  const [basicForm, setBasicForm] = useState({
    name: '',
    cover_image: '',
    description: '',
    lng: '',
    lat: ''
  });
  const [itemForm, setItemForm] = useState({
    title: '',
    cover_image: '',
    description: '',
    address: '',
    lng: '',
    lat: ''
  });
  const [editingItem, setEditingItem] = useState<any>(null);
  const [showItemModal, setShowItemModal] = useState(false);

  useEffect(() => {
    if (listId && token) {
      loadData();
    }
  }, [listId, token]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/lists?id=${listId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.list && data.list[0]) {
        setList(data.list[0]);
        setBasicForm({
          name: data.list[0].name || '',
          cover_image: data.list[0].cover_image || '',
          description: data.list[0].description || '',
          lng: data.list[0].lng || '',
          lat: data.list[0].lat || ''
        });
      }

      const itemsRes = await fetch(`/api/admin/list_items?list_id=${listId}`, { headers: { Authorization: `Bearer ${token}` } });
      const itemsData = await itemsRes.json();
      setItems(itemsData.list || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleSaveBasic = async () => {
    setSaving(true);
    try {
      await fetch(`/api/admin/lists?id=${listId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(basicForm),
      });
      alert('保存成功');
      loadData();
    } catch (e) {
      alert('保存失败');
    }
    setSaving(false);
  };

  const handleGeocode = async () => {
    const address = basicForm.description || basicForm.name;
    if (!address) {
      alert('请填写描述用于获取坐标');
      return;
    }
    try {
      const res = await fetch(`${window.location.origin}/api/admin/lists?address=${encodeURIComponent(address)}`, {
        headers: { Authorization: `Bearer ${token}` },
        method: 'PATCH',
      });
      const data = await res.json();
      if (data.success && data.lng) {
        setBasicForm(prev => ({ ...prev, lng: data.lng, lat: data.lat }));
      } else {
        alert(data.error || '未找到坐标');
      }
    } catch (e: any) {
      alert('获取坐标失败: ' + e.message);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'list' | 'item') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.url) {
        const url = data.url;
        if (type === 'list') {
          setBasicForm(prev => ({ ...prev, cover_image: url }));
        } else {
          setItemForm(prev => ({ ...prev, cover_image: url }));
        }
      }
    } catch (e) {
      alert('上传失败');
    }
    setUploading(false);
  };

  const handleSaveItem = async () => {
    if (!itemForm.title) {
      alert('请输入标题');
      return;
    }
    try {
      const method = editingItem ? 'PUT' : 'POST';
      const url = editingItem ? `/api/admin/list_items?id=${editingItem.id}` : '/api/admin/list_items';
      const body: any = { ...itemForm, list_id: listId };
      if (editingItem) delete body.list_id;

      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      setShowItemModal(false);
      setEditingItem(null);
      setItemForm({ title: '', cover_image: '', description: '', address: '', lng: '', lat: '' });
      loadData();
    } catch (e) {
      alert('保存失败');
    }
  };

  const handleDeleteItem = async (id: number) => {
    if (!window.confirm('确定删除？')) return;
    await fetch(`/api/admin/list_items?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    loadData();
  };

  const handleEditItem = (item: any) => {
    setEditingItem(item);
    setItemForm({
      title: item.title || '',
      cover_image: item.cover_image || '',
      description: item.description || '',
      address: item.address || '',
      lng: item.lng || '',
      lat: item.lat || ''
    });
    setShowItemModal(true);
  };

  const handleGeocodeItem = async (item: any) => {
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
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ lng: data.lng, lat: data.lat }),
        });
        loadData();
      } else {
        alert(data.error || '未找到');
      }
    } catch (e) {
      alert('失败');
    }
  };

  if (loading) {
    return <div className="page"><div className="loading">加载中...</div></div>;
  }

  return (
    <div className="page">
      <div className="header">
        <button className="back-btn" onClick={() => router.push('/management/lists')}>← 返回榜单列表</button>
        <h1>{list?.name || '榜单详情'}</h1>
      </div>

      <div className="section">
        <h2>榜单信息</h2>
        <div className="cover-preview" style={{ backgroundImage: basicForm.cover_image ? `url(${basicForm.cover_image})` : undefined }}>
          {!basicForm.cover_image && <span>点击上传封面</span>}
          <input type="file" accept="image/*" onChange={(e) => handleUpload(e, 'list')} disabled={uploading} />
        </div>
        <div className="form">
          <div className="field">
            <label>榜单名称 *</label>
            <input value={basicForm.name} onChange={e => setBasicForm({...basicForm, name: e.target.value})} />
          </div>
          <div className="field">
            <label>描述（用于获取坐标）</label>
            <textarea value={basicForm.description} onChange={e => setBasicForm({...basicForm, description: e.target.value})} />
          </div>
          <div className="field-row">
            <div className="field">
              <label>经度</label>
              <input value={basicForm.lng} onChange={e => setBasicForm({...basicForm, lng: e.target.value})} />
            </div>
            <div className="field">
              <label>纬度</label>
              <input value={basicForm.lat} onChange={e => setBasicForm({...basicForm, lat: e.target.value})} />
            </div>
          </div>
          <div className="btns">
            <button onClick={handleGeocode}>获取坐标</button>
            <button className="primary" onClick={handleSaveBasic} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <h2>数据列表 ({items.length})</h2>
          <button className="add-btn" onClick={() => { setEditingItem(null); setItemForm({ title: '', cover_image: '', description: '', address: '', lng: '', lat: '' }); setShowItemModal(true); }}>+ 添加</button>
        </div>
        <div className="items-grid">
          {items.map(item => (
            <div key={item.id} className="item-card">
              <div className="item-cover" style={{ backgroundImage: item.cover_image ? `url(${item.cover_image})` : undefined }}>
                {!item.cover_image && <span>无图</span>}
              </div>
              <div className="item-info">
                <div className="item-title">{item.title}</div>
              </div>
              <div className="item-actions">
                <button onClick={() => handleEditItem(item)}>编辑</button>
                <button onClick={() => handleGeocodeItem(item)}>坐标</button>
                <button className="danger" onClick={() => handleDeleteItem(item.id)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showItemModal && (
        <div className="modal" onClick={() => setShowItemModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{editingItem ? '编辑数据' : '添加数据'}</h3>
            <div className="form">
              <div className="cover-upload" style={{ backgroundImage: itemForm.cover_image ? `url(${itemForm.cover_image})` : undefined }}>
                <span>点击上传图片</span>
                <input type="file" accept="image/*" onChange={(e) => handleUpload(e, 'item')} disabled={uploading} />
              </div>
              <div className="field">
                <label>标题 *</label>
                <input value={itemForm.title} onChange={e => setItemForm({...itemForm, title: e.target.value})} />
              </div>
              <div className="field">
                <label>描述</label>
                <textarea value={itemForm.description} onChange={e => setItemForm({...itemForm, description: e.target.value})} />
              </div>
              <div className="field">
                <label>地址</label>
                <input value={itemForm.address} onChange={e => setItemForm({...itemForm, address: e.target.value})} />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>经度</label>
                  <input value={itemForm.lng} onChange={e => setItemForm({...itemForm, lng: e.target.value})} />
                </div>
                <div className="field">
                  <label>纬度</label>
                  <input value={itemForm.lat} onChange={e => setItemForm({...itemForm, lat: e.target.value})} />
                </div>
              </div>
              <div className="btns">
                <button onClick={() => setShowItemModal(false)}>取消</button>
                <button className="primary" onClick={handleSaveItem}>保存</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .page { padding: 20px; max-width: 900px; margin: 0 auto; }
        .header { margin-bottom: 20px; }
        .back-btn { background: none; border: none; color: #3b82f6; cursor: pointer; margin-bottom: 8px; }
        .header h1 { margin: 0; font-size: 20px; }
        .section { background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .section h2 { margin: 0 0 16px; font-size: 16px; }
        .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .add-btn { padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; }

        .cover-preview { height: 180px; background: #f3f4f6; border-radius: 8px; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; background-size: cover; background-position: center; }
        .cover-preview span { color: #9ca3af; }
        .cover-preview input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }

        .form { display: flex; flex-direction: column; gap: 12px; }
        .field { display: flex; flex-direction: column; gap: 4px; }
        .field label { font-size: 13px; font-weight: 500; }
        .field input, .field textarea { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; }
        .field textarea { min-height: 60px; }
        .field-row { display: flex; gap: 12px; }
        .field-row .field { flex: 1; }
        .btns { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
        .btns button { padding: 8px 16px; border: 1px solid #d1d5db; background: white; border-radius: 6px; cursor: pointer; }
        .btns button.primary { background: #3b82f6; color: white; border: none; }

        .items-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
        .item-card { background: #f9fafb; border-radius: 8px; overflow: hidden; }
        .item-cover { height: 100px; background: #e5e7eb; background-size: cover; background-position: center; }
        .item-cover span { display: flex; align-items: center; justify-content: center; height: 100%; color: #9ca3af; font-size: 12px; }
        .item-info { padding: 8px; }
        .item-title { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .item-actions { display: flex; border-top: 1px solid #e5e7eb; }
        .item-actions button { flex: 1; padding: 6px; font-size: 11px; border: none; background: white; cursor: pointer; }
        .item-actions button.danger { color: #ef4444; }

        .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: white; border-radius: 12px; padding: 20px; width: 90%; max-width: 420px; max-height: 90vh; overflow: auto; }
        .modal-content h3 { margin: 0 0 16px; font-size: 16px; }
        .cover-upload { height: 120px; background: #f3f4f6; border-radius: 8px; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; background-size: cover; }
        .cover-upload span { color: #9ca3af; font-size: 13px; }
        .cover-upload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }

        .loading { text-align: center; padding: 40px; color: #6b7280; }
      `}</style>
    </div>
  );
}