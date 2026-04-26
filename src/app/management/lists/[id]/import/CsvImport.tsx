'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAdminAuth } from '../../../admin-auth';

export default function CsvImport({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const params = useParams();
  const listId = Number(params.id);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { token } = useAdminAuth();

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      alert('请选择CSV文件');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('list_id', listId.toString());

    try {
      const res = await fetch('/api/admin/list_items/import/csv', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        setResult(data);
      }
    } catch (e) {
      alert('导入失败');
    }
    setUploading(false);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="header">
          <h2>CSV批量导入</h2>
          <button onClick={onClose}>×</button>
        </div>
        
        <div className="body">
          <div className="format">
            <h3>CSV格式：</h3>
            <code>标题,描述,坐标,地址</code>
            <p className="note">坐标格式：经度,纬度 如：116.397058,39.916520</p>
          </div>
          
          <input 
            ref={fileRef}
            type="file" 
            accept=".csv" 
            style={{ display: 'none' }}
          />
          <button className="file-btn" onClick={() => fileRef.current?.click()}>
            {fileRef.current?.files?.[0]?.name || '选择CSV文件'}
          </button>
          
          {result && (
            <div className="result">
              成功导入 {result.count} 条数据
            </div>
          )}
          
          <div className="actions">
            <button onClick={onClose}>取消</button>
            <button className="primary" onClick={handleUpload} disabled={uploading}>
              {uploading ? '导入中...' : '导入'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal { background: white; border-radius: 12px; width: 90%; max-width: 400px; }
        .header { display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid #e5e7eb; }
        .header h2 { margin: 0; font-size: 18px; }
        .header button { background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280; }
        
        .body { padding: 16px; }
        .format { margin-bottom: 16px; padding: 12px; background: #f9fafb; border-radius: 8px; }
        .format h3 { margin: 0 0 8px; font-size: 14px; }
        .format code { font-size: 12px; color: #6b7280; font-family: monospace; }
        .format .note { font-size: 11px; color: #9ca3af; margin-top: 8px; }
        
        .file-btn { width: 100%; padding: 12px; border: 1px dashed #d1d5db; border-radius: 8px; background: #f9fafb; cursor: pointer; text-align: center; }
        
        .result { margin-top: 12px; padding: 12px; background: #dcfce7; color: #166534; border-radius: 8px; }
        
        .actions { display: flex; gap: 12px; margin-top: 16px; justify-content: flex-end; }
        .actions button { padding: 10px 20px; border-radius: 6px; cursor: pointer; border: 1px solid #d1d5db; background: white; }
        .actions button.primary { background: #3b82f6; color: white; border: none; }
        .actions button:disabled { opacity: 0.6; }
      `}</style>
    </div>
  );
}