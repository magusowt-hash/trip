# 批量图片上传实现计划

**Goal:** 在榜单详情页新增批量上传图片功能，文件名与标题精确匹配后自动绑定，覆盖时自动删除旧图文件。

**Architecture:** 新增 API 端点 `DELETE /api/upload` 删除文件，在榜单详情页内添加 Modal 组件处理批量上传预览和执行。

**Tech Stack:** Next.js App Router, React, 内联样式（跟随现有项目风格）

---

### Task 1: 新增 DELETE /api/upload 端点

**Files:**
- Modify: `src/app/api/upload/route.ts`

- [ ] **Step 1: 添加 unlink import**

在 line 2 的 `writeFile, mkdir` 后添加 `unlink`

```typescript
import { writeFile, mkdir, unlink } from 'fs/promises';
```

- [ ] **Step 2: 添加 DELETE 导出函数**

在 `POST` 函数后（line 164 后）添加：

```typescript
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: '缺少 url 参数' }, { status: 400 });
    }

    const filename = url.replace('/uploads/', '');
    const filepath = join(UPLOAD_DIR, filename);

    if (existsSync(filepath)) {
      await unlink(filepath);
    }

    // 同时删除缩略图
    const thumbFilename = filename.replace(/(\.[^.]+)$/, '_thumb$1');
    const thumbPath = join(UPLOAD_DIR, thumbFilename);
    if (existsSync(thumbPath)) {
      await unlink(thumbPath);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/upload error:', error);
    return NextResponse.json({ error: '删除失败', message: String(error) }, { status: 500 });
  }
}
```

- [ ] **Step 3: 提交**

```bash
cd /root/trip && git add src/app/api/upload/route.ts && git commit -m "feat: add DELETE endpoint for uploading files"
```

---

### Task 2: 榜单详情页新增批量上传 Modal 和逻辑

**Files:**
- Modify: `src/app/management/lists/[id]/page.tsx`

- [ ] **Step 1: 新增 state**

在现有 state 区域（line 31 后）添加：

```typescript
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
```

- [ ] **Step 2: 添加批量上传处理函数**

在 `handleBatchDelete` 函数后（line 273 后）添加：

```typescript
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
```

- [ ] **Step 3: 在 section header 新增批量上传按钮**

在 line 328 `<button className="import-btn"...` 前添加：

```typescript
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
```

- [ ] **Step 4: 添加批量上传 Modal**

在 `showCsvImport` Modal 后（line 475）添加：

```typescript
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
          className="primary"
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
```

- [ ] **Step 5: 添加 Modal 和按钮样式**

在 style 区块（line 382-439 之间）末尾添加：

```css
.batch-upload-btn { padding: 8px 16px; background: #f59e0b; color: white; border: none; border-radius: 6px; cursor: pointer; }
.batch-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 2000; }
.batch-modal { background: white; border-radius: 12px; padding: 20px; width: 90%; max-width: 520px; max-height: 90vh; display: flex; flex-direction: column; }
```

- [ ] **Step 6: 提交**

```bash
cd /root/trip && git add src/app/management/lists/\[id\]/page.tsx && git commit -m "feat: add batch image upload modal with title matching and old image deletion"
```

---

### Task 3: 验证

1. 启动开发服务器 `cd /root/trip && npm run dev`
2. 打开 `http://localhost:3000/management/lists`
3. 进入某个榜单详情页
4. 确认「批量上传图片」按钮存在
5. 准备几张图片，文件名分别匹配/不匹配现有标题
6. 测试完整流程：选择图片 → 预览匹配 → 确认上传 → 验证结果