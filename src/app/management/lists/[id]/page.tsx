'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAdminAuth } from '../../layout';
import CsvImport from './import/CsvImport';

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
  });
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [itemForms, setItemForms] = useState<Record<number, { title: string; cover_image: string; description: string; lng: string; lat: string }>>({});
  const [cropFile, setCropFile] = useState<{ file: File; type: 'list' | 'item'; itemId?: number } | null>(null);
  const [cropPos, setCropPos] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [cropping, setCropping] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);

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
          cover_image: data.list[0].coverImage || '',
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'list' | 'item', itemId?: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile({ file, type, itemId });
  };

  const handleCropSave = async () => {
    if (!cropFile) return;
    setCropping(true);
    setUploading(true);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = async () => {
      canvas.width = 1280;
      canvas.height = 720;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const imgAspect = img.width / img.height;
      const targetAspect = 16 / 9;
      let dx = 0, dy = 0, dw = canvas.width, dh = canvas.height;
      
      if (imgAspect > targetAspect) {
        dh = canvas.height;
        dw = dh * imgAspect;
        dx = (canvas.width - dw) / 2;
      } else {
        dw = canvas.width;
        dh = dw / imgAspect;
        dy = (canvas.height - dh) / 2;
      }
      
      const scaledW = dw * cropPos.scale;
      const scaledH = dh * cropPos.scale;
      const tx = (canvas.width - scaledW) / 2 + cropPos.x;
      const ty = (canvas.height - scaledH) / 2 + cropPos.y;
      
      ctx.drawImage(img, tx, ty, scaledW, scaledH);

      canvas.toBlob(async (blob) => {
        if (!blob) {
          alert('裁切失败');
          setUploading(false);
          setCropping(false);
          return;
        }
        const formData = new FormData();
        formData.append('file', blob, 'cover.jpg');

        try {
          const res = await fetch('/api/upload', { 
            method: 'POST', 
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
          const data = await res.json();
          if (data.url) {
            if (cropFile.type === 'list') {
              setBasicForm(prev => ({ ...prev, cover_image: data.url }));
            } else if (cropFile.itemId) {
              setItemForms(prev => ({ ...prev, [cropFile.itemId]: { ...prev[cropFile.itemId], cover_image: data.url } }));
            }
          } else if (data.error) {
            alert(data.error);
          }
        } catch (e) {
          alert('上传失败');
        }
        setCropFile(null);
        setCropPos({ x: 0, y: 0, scale: 1 });
        setUploading(false);
        setCropping(false);
      }, 'image/jpeg', 0.9);
    };
    img.src = URL.createObjectURL(cropFile.file);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setCropPos(prev => ({ ...prev, scale: Math.min(Math.max(prev.scale * delta, 0.5), 3) }));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - cropPos.x, y: e.clientY - cropPos.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setCropPos(prev => ({ ...prev, x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handlePasteCoords = async (itemId: number) => {
    const text = prompt('请粘贴坐标（逗号分隔，如: 116.397,39.916）');
    if (text) {
      const match = text.match(/^([^,]+),([^,]+)$/);
      if (match) {
        setItemForms(prev => ({
          ...prev,
          [itemId]: { ...prev[itemId], lng: match[1].trim(), lat: match[2].trim() }
        }));
      } else {
        alert('格式错误，请输入逗号分隔的坐标');
      }
    }
  };

  const handleSaveItem = async (itemId: number) => {
    const form = itemForms[itemId];
    if (!form?.title) {
      alert('请输入标题');
      return;
    }
    try {
      const res = await fetch(`/api/admin/list_items?id=${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      }
      setEditingItemId(null);
      loadData();
    } catch (e) {
      alert('保存失败');
    }
  };

  const handleAddItem = async () => {
    const title = prompt('请输入标题');
    if (!title) return;
    try {
      await fetch('/api/admin/list_items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ list_id: listId, title }),
      });
      loadData();
    } catch (e) {
      alert('添加失败');
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

  const startEdit = (item: any) => {
    setEditingItemId(item.id);
    setItemForms(prev => ({ ...prev, [item.id]: {
      title: item.title,
      cover_image: item.cover_image,
      description: item.description,
      lng: item.lng,
      lat: item.lat,
    } }));
  };

  const cancelEdit = () => {
    setEditingItemId(null);
  };

  if (loading) {
    return <div className="page"><div className="loading">加载中...</div></div>;
  }

  return (
    <div className="page">
      <div className="header">
        <button className="back-btn" onClick={() => router.push('/management/lists')}>← 返回</button>
      </div>

      <div className="list-header">
        <div className="cover-box" style={{ backgroundImage: basicForm.cover_image ? `url(${basicForm.cover_image})` : undefined }}>
          {!basicForm.cover_image && <span>封面</span>}
          <input type="file" accept="image/*" onChange={(e) => handleFileSelect(e, 'list')} disabled={uploading} />
        </div>
        <div className="list-info">
          <input 
            className="name-input" 
            value={basicForm.name} 
            onChange={e => setBasicForm({...basicForm, name: e.target.value})}
            placeholder="榜单名称"
          />
          <button className="save-btn" onClick={handleSaveBasic} disabled={saving}>
            {saving ? '保存中' : '保存'}
          </button>
        </div>
      </div>

      <div className="items-section">
        <div className="section-header">
          <h2>数据 ({items.length})</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="import-btn" onClick={() => setShowCsvImport(true)}>CSV导入</button>
            <button className="add-btn" onClick={handleAddItem}>+ 添加</button>
          </div>
        </div>
        <div className="items-list">
          {items.map(item => (
            <div key={item.id} className="item-row">
              {editingItemId === item.id ? (
                <div className="item-edit">
                  <div className="item-cover-edit" style={{ backgroundImage: itemForms[item.id]?.cover_image ? `url(${itemForms[item.id].cover_image})` : undefined }}>
                    <input type="file" accept="image/*" onChange={(e) => handleFileSelect(e, 'item', item.id)} disabled={uploading} />
                  </div>
                  <div className="item-fields">
                    <input value={itemForms[item.id].title} onChange={e => setItemForms(p => ({ ...p, [item.id]: {...p[item.id], title: e.target.value }}))} placeholder="标题" />
                    <textarea value={itemForms[item.id].description || ''} onChange={e => setItemForms(p => ({ ...p, [item.id]: {...p[item.id], description: e.target.value }}))} placeholder="描述（地点介绍）" rows={2} />
                    <div className="coords">
                      <button type="button" className="paste-btn" onClick={() => handlePasteCoords(item.id)}>粘贴坐标</button>
                      <input value={itemForms[item.id].lng || ''} onChange={e => setItemForms(p => ({ ...p, [item.id]: {...p[item.id], lng: e.target.value }}))} placeholder="经度" />
                      <input value={itemForms[item.id].lat || ''} onChange={e => setItemForms(p => ({ ...p, [item.id]: {...p[item.id], lat: e.target.value }}))} placeholder="纬度" />
                    </div>
                  </div>
                  <div className="item-edit-btns">
                    <button onClick={cancelEdit}>取消</button>
                    <button className="primary" onClick={() => handleSaveItem(item.id)}>保存</button>
                  </div>
                </div>
              ) : (
                <div className="item-display" onClick={() => startEdit(item)}>
                  <div className="item-order">{item.orderNum}</div>
                  <div className="item-thumb" style={{ backgroundImage: item.cover_image ? `url(${item.cover_image})` : undefined }}>
                    {!item.cover_image && <span>图</span>}
                  </div>
                  <div className="item-main">
                    <div className="item-title">{item.title}</div>
                    <div className="item-desc">{item.description || '无描述'}</div>
                  </div>
                  <button className="del-btn" onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }}>×</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .page { padding: 20px; max-width: 800px; margin: 0 auto; }
        .header { margin-bottom: 16px; }
        .back-btn { background: none; border: none; color: #3b82f6; cursor: pointer; }
        
        .list-header { display: flex; gap: 16px; margin-bottom: 24px; }
        .cover-box { width: 200px; height: 130px; background: #f3f4f6; border-radius: 12px; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; background-size: cover; background-position: center; flex-shrink: 0; }
        .cover-box span { color: #9ca3af; font-size: 14px; }
        .cover-box input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
        
        .list-info { flex: 1; display: flex; flex-direction: column; gap: 12px; justify-content: center; }
        .name-input { font-size: 20px; font-weight: 600; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 8px; }
        .save-btn { padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; align-self: flex-start; }
        
        .items-section { background: white; border-radius: 12px; padding: 16px; }
        .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .section-header h2 { margin: 0; font-size: 16px; }
        .add-btn { padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; }
        .import-btn { padding: 8px 16px; background: #8b5cf6; color: white; border: none; border-radius: 6px; cursor: pointer; }
        
        .items-list { display: flex; flex-direction: column; gap: 8px; }
        .item-row { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
        
        .item-display { display: flex; gap: 12px; padding: 10px; align-items: center; cursor: pointer; }
        .item-order { width: 24px; height: 24px; background: #3b82f6; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0; }
        .item-thumb { width: 60px; height: 60px; background: #f3f4f6; border-radius: 6px; background-size: cover; background-position: center; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        .item-thumb span { font-size: 11px; color: #9ca3af; }
        .item-main { flex: 1; min-width: 0; }
        .item-title { font-size: 14px; font-weight: 600; }
        .item-desc { font-size: 12px; color: #6b7280; margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .del-btn { width: 24px; height: 24px; background: #fee2e2; color: #ef4444; border: none; border-radius: 50%; cursor: pointer; font-size: 16px; flex-shrink: 0; }
        
        .item-edit { display: flex; gap: 12px; padding: 12px; background: #f9fafb; }
        .item-cover-edit { width: 80px; height: 80px; background: #e5e7eb; border-radius: 8px; position: relative; overflow: hidden; background-size: cover; flex-shrink: 0; }
        .item-cover-edit input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
        .item-fields { flex: 1; display: flex; flex-direction: column; gap: 6px; }
        .item-fields input, .item-fields textarea { padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; }
        .item-fields textarea { resize: vertical; min-height: 50px; }
        .item-fields .coords { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .item-fields .coords input { width: 80px; }
        .paste-btn { padding: 6px 10px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-size: 12px; }
        .item-edit-btns { display: flex; flex-direction: column; gap: 6px; justify-content: center; }
        .item-edit-btns button { padding: 6px 12px; border: 1px solid #d1d5db; background: white; border-radius: 6px; cursor: pointer; font-size: 12px; }
        .item-edit-btns button.primary { background: #3b82f6; color: white; border: none; }
        
        .loading { text-align: center; padding: 40px; color: #6b7280; }
        
        .crop-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 2000; }
        .crop-box { background: white; border-radius: 12px; padding: 16px; width: 90%; max-width: 500px; }
        .crop-preview { width: 100%; aspect-ratio: 16/9; background: #f3f4f6; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; position: relative; }
        .crop-preview img { max-width: 100%; max-height: 100%; object-fit: contain; }
        .crop-btns { display: flex; gap: 8px; justify-content: flex-end; }
        .crop-btns button { padding: 8px 16px; border-radius: 6px; cursor: pointer; border: 1px solid #d1d5db; background: white; }
        .crop-btns button.primary { background: #3b82f6; color: white; border: none; }
      `}</style>

      {cropFile && (
        <div className="crop-overlay">
          <div className="crop-box">
            <h3 style={{ margin: '0 0 12px' }}>裁切封面 (16:9)</h3>
            <div className="crop-preview" style={{ overflow: 'hidden', cursor: isDragging ? 'grabbing' : 'grab' }}>
              <img 
                src={URL.createObjectURL(cropFile.file)} 
                alt="预览" 
                style={{ 
                  transform: `translate(${cropPos.x}px, ${cropPos.y}px) scale(${cropPos.scale})`,
                  transformOrigin: 'center',
                  maxWidth: 'none',
                  height: '100%',
                  objectFit: 'contain'
                }}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
            </div>
            <div className="crop-hint" style={{ fontSize: '12px', color: '#6b7280', textAlign: 'center', marginBottom: '8px' }}>
              滚轮缩放 · 拖动移动
            </div>
            <div className="crop-btns">
              <button onClick={() => setCropFile(null)}>取消</button>
              <button className="primary" onClick={handleCropSave} disabled={cropping}>
                {cropping ? '处理中...' : '裁切并上传'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showCsvImport && <CsvImport onClose={() => { setShowCsvImport(false); loadData(); }} />}
    </div>
  );
}