'use client';

import { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useAdminAuth } from '../../admin-auth';

const FORMATS: Record<string, { label: string; cols: string; hint?: string }> = {
  address: { label: '批量导入地址', cols: '标题,地址', hint: '按标题匹配条目，填入地址' },
  intro: { label: '批量导入简介', cols: '标题,简介', hint: '按标题匹配条目，填入简介' },
  image_url: { label: '批量导入网络图片', cols: '标题,图片URL', hint: '按标题匹配条目，填入图片URL' },
  transport: { label: '批量导入交通', cols: '标题,飞机,火车,大巴', hint: '按标题匹配条目，填入交通信息（逗号分隔多个）' },
  rating: { label: '批量导入评分', cols: '标题,类型,自定义内容', hint: '类型填 system 或 custom，系统评分时自定义留空' },
};

export default function BatchImport({ type, onClose }: { type: string; onClose: () => void }) {
  const params = useParams();
  const listId = Number(params.id);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { token } = useAdminAuth();
  const fmt = FORMATS[type] || { label: '批量导入', cols: '标题,值' };

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { alert('请选择CSV文件'); return; }
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('list_id', listId.toString());
    formData.append('type', type);
    try {
      const res = await fetch('/api/admin/list_items/import/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.error) { alert(data.error); }
      else { setResult(data); }
    } catch { alert('导入失败'); }
    setUploading(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 12, width: '90%', maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{fmt.label}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ marginBottom: 16, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>CSV格式：</div>
            <code style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>{fmt.cols}</code>
            {fmt.hint && <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>{fmt.hint}</p>}
          </div>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} />
          <button
            onClick={() => fileRef.current?.click()}
            style={{ width: '100%', padding: 12, border: '1px dashed #d1d5db', borderRadius: 8, background: '#f9fafb', cursor: 'pointer', textAlign: 'center', fontSize: 14 }}
          >
            {fileRef.current?.files?.[0]?.name || '选择CSV文件'}
          </button>
          {result && (
            <div style={{ marginTop: 12, padding: 12, background: result.errors?.length > 0 ? '#fef3c7' : '#dcfce7', borderRadius: 8, fontSize: 13 }}>
              <div style={{ color: result.errors?.length > 0 ? '#92400e' : '#166534' }}>
                更新 {result.updated} 条，跳过 {result.skipped} 条
                {result.errors?.length > 0 && <div style={{ marginTop: 4, color: '#dc2626' }}>错误: {result.errors?.slice(0, 3).join(', ')}</div>}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 16, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 6, cursor: 'pointer', border: '1px solid #d1d5db', background: 'white' }}>取消</button>
            <button onClick={handleUpload} disabled={uploading} style={{ padding: '10px 20px', borderRadius: 6, cursor: 'pointer', border: 'none', background: uploading ? '#9ca3af' : '#3b82f6', color: 'white' }}>
              {uploading ? '导入中...' : '导入'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
