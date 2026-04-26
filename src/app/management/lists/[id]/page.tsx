'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAdminAuth } from '../../admin-auth';
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
    position: 0,
    intro: '',
  });
  const [listImages, setListImages] = useState<any[]>([]);
  const [listBatchUploading, setListBatchUploading] = useState(false);
  const [listBatchFiles, setListBatchFiles] = useState<File[]>([]);
  const [listBatchMatches, setListBatchMatches] = useState<Array<{
    file: File;
    previewUrl: string;
    skipped: boolean;
  }>>([]);
  const [listBatchResults, setListBatchResults] = useState<{ success: number; failed: number } | null>(null);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [itemForms, setItemForms] = useState<Record<number, { title: string; cover_image: string; description: string; lng: string; lat: string; intro: string; image_url: string }>>({});
  const [cropFile, setCropFile] = useState<{ file: File; type: 'list' | 'item'; itemId?: number } | null>(null);
  const [cropPos, setCropPos] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [cropping, setCropping] = useState(false);
const [showCsvImport, setShowCsvImport] = useState(false);
const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
const [showBatchUpload, setShowBatchUpload] = useState(false);
const [batchFiles, setBatchFiles] = useState<File[]>([]);
const [batchMatches, setBatchMatches] = useState<Array<{
  file: File;
  matchedItem: any | null;
  skipped: boolean;
  previewUrl: string;
}>>([]);
const [batchUploading, setBatchUploading] = useState(false);
const [batchResults, setBatchResults] = useState<{ success: number; failed: number; skipped: number } | null>(null);

  useEffect(() => {
    if (listId && token) {
      loadData();
    }
  }, [listId, token]);

   const loadData = async () => {
     setLoading(true);
     setSelectedItems(new Set());
     try {
       const res = await fetch(`/api/admin/lists?id=${listId}`, { headers: { Authorization: `Bearer ${token}` } });
       const data = await res.json();
       if (data.list && data.list[0]) {
         const item = data.list[0];
         setList(item);
         setBasicForm({
           name: item.name || '',
           cover_image: item.coverImage || '',
           position: item.position ?? 0,
           intro: item.intro || '',
         });
       }

       const itemsRes = await fetch(`/api/admin/list_items?list_id=${listId}`, { headers: { Authorization: `Bearer ${token}` } });
       const itemsData = await itemsRes.json();
       setItems(itemsData.list || []);

       // Fetch list images
       const imagesRes = await fetch(`/api/admin/list_images?list_id=${listId}`, { headers: { Authorization: `Bearer ${token}` } });
       const imagesData = await imagesRes.json();
       setListImages(imagesData.list || []);
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
    if (!ctx) return;
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
              const itemId = cropFile.itemId;
              setItemForms(prev => ({ ...prev, [itemId]: { ...prev[itemId], cover_image: data.url } }));
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

  // List images handlers
  const handleListBatchFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const matches = files.map(file => {
      const previewUrl = URL.createObjectURL(file);
      return {
        file,
        previewUrl,
        skipped: false,
      };
    });

    setListBatchFiles(files);
    setListBatchMatches(matches);
    setListBatchResults(null);
  };

  const toggleListBatchSkip = (index: number) => {
    setListBatchMatches(prev => prev.map((m, i) => i === index ? { ...m, skipped: !m.skipped } : m));
  };

  const handleListBatchDelete = () => {
    setListBatchFiles([]);
    setListBatchMatches([]);
    setListBatchResults(null);
  };

  const handleListBatchUpload = async () => {
    setListBatchUploading(true);
    let success = 0, failed = 0;

    for (const match of listBatchMatches) {
      if (match.skipped) {
        continue;
      }

      try {
        const formData = new FormData();
        formData.append('file', match.file);
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (!uploadData.url) throw new Error('上传失败');

        await fetch('/api/admin/list_images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            listId: listId,
            url: uploadData.url,
            thumbnailUrl: uploadData.thumbnailUrl || null,
            caption: '',
            sortOrder: 0,
          }),
        });

        success++;
      } catch (e) {
        console.error(e);
        failed++;
      }
    }

    setListBatchResults({ success, failed });

    if (failed === 0) {
      setTimeout(() => {
        setListBatchUploading(false);
        setListBatchFiles([]);
        setListBatchMatches([]);
        setListBatchResults(null);
        loadData(); // Reload to get the new images
      }, 2000);
    } else {
      setListBatchUploading(false);
    }
  };

  const handleDeleteListImage = async (imageId: number) => {
    if (!window.confirm('确定删除该图片？')) return;
    try {
      await fetch(`/api/admin/list_images?id=${imageId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      loadData();
    } catch (e) {
      alert('删除失败');
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

  const toggleSelect = (id: number) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map(i => i.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedItems.size === 0) return;
    if (!window.confirm(`确定删除选中的 ${selectedItems.size} 项？`)) return;
    
    const promises = Array.from(selectedItems).map(id =>
      fetch(`/api/admin/list_items?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
    );
    
    await Promise.all(promises);
    setSelectedItems(new Set());
    loadData();
  };

  const handleBatchFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const matches = files.map(file => {
      const fileName = file.name.replace(/\.[^.]+$/, '');
      const matchedItem = items.find(item => item.title.toLowerCase() === fileName.toLowerCase());
      const previewUrl = URL.createObjectURL(file);
      return {
        file,
        matchedItem: matchedItem || null,
        skipped: !matchedItem,
        previewUrl,
      };
    });

    setBatchFiles(files);
    setBatchMatches(matches);
    setBatchResults(null);
    setShowBatchUpload(true);
  };

  const handleBatchUpload = async () => {
    setBatchUploading(true);
    let success = 0, failed = 0, skipped = 0;

    for (const match of batchMatches) {
      if (match.skipped) {
        skipped++;
        continue;
      }

      try {
        if (match.matchedItem.cover_image) {
          await fetch('/api/upload', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ url: match.matchedItem.cover_image }),
          });
        }

        const formData = new FormData();
        formData.append('file', match.file);
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (!uploadData.url) throw new Error('上传失败');

        await fetch(`/api/admin/list_items?id=${match.matchedItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ cover_image: uploadData.url }),
        });

        success++;
      } catch (e) {
        console.error(e);
        failed++;
      }
    }

    setBatchResults({ success, failed, skipped });
    setBatchUploading(false);

    if (failed === 0) {
      setTimeout(() => {
        setShowBatchUpload(false);
        setBatchFiles([]);
        setBatchMatches([]);
        setBatchResults(null);
        loadData();
      }, 2000);
    }
  };

  const toggleBatchSkip = (index: number) => {
    setBatchMatches(prev => prev.map((m, i) => i === index ? { ...m, skipped: !m.skipped } : m));
  };

  const startEdit = (item: any) => {
    setEditingItemId(item.id);
    setItemForms(prev => ({ ...prev, [item.id]: {
      title: item.title,
      cover_image: item.cover_image,
      description: item.description,
      lng: item.lng,
      lat: item.lat,
      intro: item.intro || '',
      image_url: item.image_url || '',
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
           <input
             className="name-input"
             value={basicForm.position}
             onChange={e => setBasicForm({...basicForm, position: parseInt(e.target.value) || 0})}
             placeholder="位置（数字）"
           />
           <textarea
             className="name-input"
             value={basicForm.intro}
             onChange={e => setBasicForm({...basicForm, intro: e.target.value})}
             placeholder="简介"
             rows={2}
           />
           <button className="save-btn" onClick={handleSaveBasic} disabled={saving}>
             {saving ? '保存中' : '保存'}
           </button>
         </div>
       </div>

       {/* List images upload and display */}
       <div className="list-images-section">
         <div className="section-header">
           <h2>榜单图片（可多张）</h2>
           <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
             <button className="batch-upload-btn" onClick={() => document.getElementById('list-batch-upload-input')?.click()}>
               批量上传图片
             </button>
             <input
               id="list-batch-upload-input"
               type="file"
               accept="image/*"
               multiple
               style={{ display: 'none' }}
               onChange={handleListBatchFileSelect}
             />
             {listBatchMatches.length > 0 && (
               <button className="batch-del-btn" onClick={handleListBatchDelete}>清空批量</button>
             )}
           </div>
         </div>
         {listImages.length > 0 ? (
           <div className="images-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
             {listImages.map((img, idx) => (
               <div key={img.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                 <img 
                   src={img.url} 
                   alt="" 
                   style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8 }} 
                 />
                 {img.caption && (
                   <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
                     {img.caption}
                   </div>
                 )}
                 <button 
                   onClick={() => handleDeleteListImage(img.id)} 
                   style={{ 
                     position: 'absolute', 
                     top: 4, 
                     right: 4, 
                     background: '#ef4444', 
                     color: 'white', 
                     border: 'none', 
                     borderRadius: '12px', 
                     padding: '2px 6px', 
                     fontSize: '12px', 
                     cursor: 'pointer' 
                   }}
                 >
                   ×
                 </button>
               </div>
             ))}
           </div>
         ) : (
           <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px' }}>暂无图片</div>
         )}
         {listBatchMatches.length > 0 && (
           <div className="batch-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
             <div className="batch-modal" style={{ background: 'white', borderRadius: '12px', padding: '20px', width: '90%', maxWidth: '520px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
               <h3 style={{ margin: '0 0 12px', fontSize: '16px' }}>批量上传图片</h3>
               {listBatchMatches.length > 0 && (
                 <div className="batch-info" style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
                   共 {listBatchFiles.length} 张，待上传 {listBatchMatches.filter(m => !m.skipped).length} 张，跳过 {listBatchMatches.filter(m => m.skipped).length} 张
                 </div>
               )}
               <div className="batch-list" style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                 {listBatchMatches.map((match, index) => (
                   <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '8px', borderRadius: '6px', background: match.skipped ? '#fef2f2' : '#fff7ed', border: '1px solid', borderColor: match.skipped ? '#fecaca' : '#fed7aa' }}>
                     <img src={match.previewUrl} alt="" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px' }} />
                     <div style={{ flex: 1, minWidth: 0 }}>
                       <div style={{ fontSize: '13px', fontWeight: '500' }}>{match.file.name}</div>
                       {match.skipped ? (
                         <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#6b7280', flexShrink: 0 }}>
                           <input type="checkbox" checked={match.skipped} onChange={() => toggleListBatchSkip(index)} />
                           跳过
                         </label>
                       ) : (
                         <span style={{ fontSize: '11px', color: '#22c55e', flexShrink: 0 }}>待上传</span>
                       )}
                     </div>
                   </div>
                 ))}
               </div>
               {listBatchResults ? (
                 <div style={{ textAlign: 'center', padding: '16px', background: listBatchResults.failed > 0 ? '#fef2f2' : '#f0fdf4', borderRadius: '8px', marginBottom: '8px' }}>
                   <div style={{ fontSize: '14px', fontWeight: '600' }}>完成</div>
                   <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                     成功 {listBatchResults.success} 张，失败 {listBatchResults.failed} 张
                   </div>
                 </div>
               ) : null}
               <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                 <button
                   onClick={() => { setListBatchUploading(false); setListBatchFiles([]); setListBatchMatches([]); setListBatchResults(null); }}
                   style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white', cursor: 'pointer' }}
                 >
                   取消
                 </button>
                 <button
                   onClick={handleListBatchUpload}
                   disabled={listBatchUploading || listBatchMatches.filter(m => !m.skipped).length === 0}
                   style={{ padding: '8px 16px', borderRadius: '6px', background: listBatchUploading || listBatchMatches.filter(m => !m.skipped).length === 0 ? '#9ca3af' : '#3b82f6', color: 'white', border: 'none', cursor: listBatchUploading || listBatchMatches.filter(m => !m.skipped).length === 0 ? 'not-allowed' : 'pointer' }}
                 >
                   {listBatchUploading ? '上传中...' : `确认上传 (${listBatchMatches.filter(m => !m.skipped).length})`}
                 </button>
               </div>
             </div>
           </div>
         )}
       </div>

       <div className="items-section">
        <div className="section-header">
          <h2>数据 ({items.length})</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {items.length > 0 && (
              <label style={{ fontSize: '13px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                <input type="checkbox" checked={selectedItems.size === items.length && items.length > 0} onChange={toggleSelectAll} />
                全选
              </label>
            )}
            <button className="batch-upload-btn" onClick={() => document.getElementById('batch-upload-input')?.click()}>
              批量上传图片
            </button>
            <input
              id="batch-upload-input"
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={handleBatchFileSelect}
            />
            <button className="import-btn" onClick={() => setShowCsvImport(true)}>CSV导入</button>
            {selectedItems.size > 0 && (
              <button className="batch-del-btn" onClick={handleBatchDelete}>删除({selectedItems.size})</button>
            )}
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
                    <textarea value={itemForms[item.id]?.intro || ''} onChange={e => setItemForms(p => ({ ...p, [item.id]: {...p[item.id], intro: e.target.value }}))} placeholder="简介" rows={2} />
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: 6 }}>
                      <input 
                        value={itemForms[item.id]?.image_url || ''} 
                        onChange={e => setItemForms(p => ({ ...p, [item.id]: {...p[item.id], image_url: e.target.value }}))} 
                        placeholder="网络图片URL" 
                        style={{ flex: 1, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} 
                      />
                      {itemForms[item.id]?.image_url && (
                        <img src={itemForms[item.id].image_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />
                      )}
                    </div>
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
                  <input 
                    type="checkbox" 
                    className="item-check"
                    checked={selectedItems.has(item.id)}
                    onChange={(e) => { e.stopPropagation(); toggleSelect(item.id); }}
                    onClick={(e) => e.stopPropagation()}
                  />
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
        .item-check { width: 18px; height: 18px; cursor: pointer; }
        .item-order { width: 24px; height: 24px; background: #3b82f6; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0; }
        .item-thumb { width: 60px; height: 60px; background: #f3f4f6; border-radius: 6px; background-size: cover; background-position: center; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        .item-thumb span { font-size: 11px; color: #9ca3af; }
        .item-main { flex: 1; min-width: 0; }
        .item-title { font-size: 14px; font-weight: 600; }
        .item-desc { font-size: 12px; color: #6b7280; margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .del-btn { width: 24px; height: 24px; background: #fee2e2; color: #ef4444; border: none; border-radius: 50%; cursor: pointer; font-size: 16px; flex-shrink: 0; }
        .del-btn:hover { background: #fecaca; }
        .batch-del-btn { padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
        
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
         
         .batch-upload-btn { padding: 8px 16px; background: #f59e0b; color: white; border: none; border-radius: 6px; cursor: pointer; }
         .batch-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 2000; }
         .batch-modal { background: white; border-radius: 12px; padding: 20px; width: 90%; max-width: 520px; max-height: 90vh; display: flex; flex-direction: column; }
         
         .list-images-section { margin-top: 24px; }
         .list-images-section .section-header h2 { font-size: 16px; margin: 0 0 12px 0; }
         .list-images-section .batch-upload-btn { padding: 8px 16px; background: #f59e0b; color: white; border: none; border-radius: 6px; cursor: pointer; }
         .list-images-section .batch-del-btn { padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
         .images-list { overflow: hidden; }
         .images-list div { position: relative; }
         
         .list-batch-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 2000; }
         .list-batch-modal { background: white; border-radius: 12px; padding: 20px; width: 90%; max-width: 520px; max-height: 90vh; display: flex; flex-direction: column; }
         .list-batch-modal h3 { margin: 0 0 12px 0; font-size: 16px; }
         .list-batch-modal .batch-info { fontSize: '13px', color: '#6b7280', marginBottom: '12px' }
         .list-batch-modal .batch-list { maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }
         .list-batch-modal .batch-list div { display: 'flex', gap: '8px', alignItems: 'center', padding: '8px', borderRadius: '6px', background: match.skipped ? '#fef2f2' : '#fff7ed', border: '1px solid', borderColor: match.skipped ? '#fecaca' : '#fed7aa' }
         .list-batch-modal .batch-list div img { width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px' }
         .list-batch-modal .batch-list div div { flex: 1, minWidth: 0; }
         .list-batch-modal .batch-list div div div { fontSize: '13px', fontWeight: '500' }
         .list-batch-modal .batch-list div div div { fontSize: '12px', color: '#6b7280' }
         .list-batch-modal .batch-list div div label { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#6b7280', flexShrink: 0; }
         .list-batch-modal .batch-list div div label input { type: 'checkbox' }
         .list-batch-modal .batch-list div div span { fontSize: '11px' }
         .list-batch-modal .batch-results { textAlign: 'center', padding: '16px', background: listBatchResults.failed > 0 ? '#fef2f2' : '#f0fdf4', borderRadius: '8px', marginBottom: '8px' }
         .list-batch-modal .batch-results div { fontSize: '14px', fontWeight: '600' }
         .list-batch-modal .batch-results div { fontSize: '13px', color: '#6b7280', marginTop: '4px' }
         .list-batch-modal .batch-actions { display: 'flex', gap: '8px', justifyContent: 'flex-end' }
         .list-batch-modal .batch-actions button { padding: '8px 16px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white', cursor: 'pointer' }
         .list-batch-modal .batch-actions button:first-child { onClick: () => { setListBatchUploading(false); setListBatchFiles([]); setListBatchMatches([]); setListBatchResults(null); } }
         .list-batch-modal .batch-actions button:last-child { onClick: handleListBatchUpload, disabled: listBatchUploading || listBatchMatches.filter(m => !m.skipped).length === 0, style: { padding: '8px 16px', borderRadius: '6px', background: listBatchUploading || listBatchMatches.filter(m => !m.skipped).length === 0 ? '#9ca3af' : '#3b82f6', color: 'white', border: 'none', cursor: listBatchUploading || listBatchMatches.filter(m => !m.skipped).length === 0 ? 'not-allowed' : 'pointer' } }
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
      {showBatchUpload && (
        <div className="batch-overlay">
          <div className="batch-modal">
            <h3 style={{ margin: '0 0 12px', fontSize: '16px' }}>批量上传图片</h3>
            {batchMatches.length > 0 && (
              <div className="batch-info" style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
                共 {batchFiles.length} 张，已匹配 {batchMatches.filter(m => !m.skipped).length} 张，跳过 {batchMatches.filter(m => m.skipped).length} 张
              </div>
            )}
            <div className="batch-list" style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {batchMatches.map((match, index) => (
                <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '8px', borderRadius: '6px', background: match.skipped ? '#fef2f2' : match.matchedItem ? '#f0fdf4' : '#fff7ed', border: '1px solid', borderColor: match.skipped ? '#fecaca' : match.matchedItem ? '#bbf7d0' : '#fed7aa' }}>
                  <img src={match.previewUrl} alt="" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{match.file.name}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      {match.matchedItem ? `→ ${match.matchedItem.title}` : '未匹配到标题'}
                    </div>
                  </div>
                  {!match.matchedItem ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#6b7280', flexShrink: 0 }}>
                      <input type="checkbox" checked={match.skipped} onChange={() => toggleBatchSkip(index)} />
                      跳过
                    </label>
                  ) : match.matchedItem.cover_image ? (
                    <span style={{ fontSize: '11px', color: '#f59e0b', flexShrink: 0 }}>将覆盖</span>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#22c55e', flexShrink: 0 }}>待上传</span>
                  )}
                </div>
              ))}
            </div>
            {batchResults ? (
              <div style={{ textAlign: 'center', padding: '16px', background: batchResults.failed > 0 ? '#fef2f2' : '#f0fdf4', borderRadius: '8px', marginBottom: '8px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>完成</div>
                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                  成功 {batchResults.success} 张，失败 {batchResults.failed} 张，跳过 {batchResults.skipped} 张
                </div>
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowBatchUpload(false); setBatchFiles([]); setBatchMatches([]); setBatchResults(null); }}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white', cursor: 'pointer' }}
              >
                取消
              </button>
              <button
                onClick={handleBatchUpload}
                disabled={batchUploading || batchMatches.filter(m => !m.skipped).length === 0}
                style={{ padding: '8px 16px', borderRadius: '6px', background: batchUploading || batchMatches.filter(m => !m.skipped).length === 0 ? '#9ca3af' : '#3b82f6', color: 'white', border: 'none', cursor: batchUploading || batchMatches.filter(m => !m.skipped).length === 0 ? 'not-allowed' : 'pointer' }}
              >
                {batchUploading ? '上传中...' : `确认上传 (${batchMatches.filter(m => !m.skipped).length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}